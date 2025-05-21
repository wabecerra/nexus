import os
import json
import boto3
import redis
import hashlib
from botocore.exceptions import ClientError

def get_env(name, default=None):
    value = os.environ.get(name)
    if value is None and default is not None:
        return default
    if value is None:
        raise RuntimeError(f"Missing env var: {name}")
    return value

REGION = get_env('REGION')
MODEL_ID = get_env('MODEL_ID')
CONFIG_TABLE = get_env('CONFIG_TABLE')
PROMPT_BUCKET = get_env('PROMPT_BUCKET')

ddb = boto3.resource('dynamodb', region_name=REGION).Table(CONFIG_TABLE)
s3 = boto3.client('s3', region_name=REGION)
bedrock = boto3.client('bedrock-runtime', region_name=REGION)
redis_client = None  # Configure if using Redis

def load_prompt_from_s3(bucket, key):
    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        return obj['Body'].read().decode('utf-8')
    except Exception as e:
        print(f"Prompt load failed: {e}")
        return "Summarize the following:\n\n{{text}}\n\nSummary:"

def lambda_handler(event, context):
    claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
    tenant_id = claims.get("custom:tenantId")
    user_id = claims.get("sub")
    if not tenant_id:
        return {"statusCode": 401, "body": json.dumps({"error": "Unauthorized: no tenant ID"})}

    body_str = event.get("body", "")
    try:
        body = json.loads(body_str) if body_str else {}
    except json.JSONDecodeError:
        return {"statusCode": 400, "body": json.dumps({"error": "Invalid JSON in request body"})}
    text_to_summarize = body.get("text") or body.get("content")
    if not text_to_summarize:
        return {"statusCode": 400, "body": json.dumps({"error": "Missing 'text' to summarize"})}

    try:
        config_item = ddb.get_item(Key={"TenantID": tenant_id}).get('Item', {})
    except ClientError as e:
        print(f"Config fetch failed: {e}")
        config_item = {}
    model_id = config_item.get("ModelId", MODEL_ID)
    prompt_s3_key = config_item.get("DefaultPrompt", "prompts/default_prompt.txt")

    prompt_template = load_prompt_from_s3(PROMPT_BUCKET, prompt_s3_key)
    full_prompt = prompt_template.replace("{{text}}", text_to_summarize)

    # Compute cache key
    key_base = f"{tenant_id}:{model_id}:"
    text_hash = hashlib.md5(text_to_summarize.encode('utf-8')).hexdigest()
    cache_key = key_base + text_hash
    cached_summary = None
    if redis_client:
        try:
            cached_bytes = redis_client.get(cache_key)
            if cached_bytes:
                cached_summary = cached_bytes.decode('utf-8')
        except Exception as e:
            print(f"Redis cache error: {e}")
    if cached_summary:
        return {"statusCode": 200, "body": json.dumps({"summary": cached_summary, "cached": True})}

    # Call Bedrock
    payload = {
        "prompt": full_prompt,
        "maxTokens": 1024,
        "temperature": 0.7
    }
    try:
        response = bedrock.invoke_model(
            modelId=model_id,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(payload)
        )
        response_payload = json.loads(response.get('body', '{}'))
        summary_text = response_payload.get('completion') or response_payload.get('results', [{}])[0].get('outputText') or str(response_payload)
    except Exception as e:
        print(f"Bedrock error: {e}")
        return {"statusCode": 500, "body": json.dumps({"error": "Model inference failed"})}

    if redis_client and summary_text:
        try:
            redis_client.set(cache_key, summary_text, ex=3600)
        except Exception as e:
            print(f"Redis store error: {e}")

    return {
        "statusCode": 200,
        "body": json.dumps({"summary": summary_text, "cached": False})
    }
