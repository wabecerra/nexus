import json
import os
import boto3

bedrock = boto3.client('bedrock-runtime', region_name=os.getenv('REGION'))

def lambda_handler(event, context):
    try:
        body = json.loads(event['body'])
        history = body.get('history', [])

        prompt = f"""
        Resume brevemente estas interacciones:
        {json.dumps(history, ensure_ascii=False)}

        Devuelve JSON:
        {{ "summary": "...", "recommended_action": "..." }}
        """

        response = bedrock.invoke_model(
            modelId=os.getenv('MODEL_ID'),
            body=json.dumps({"prompt": prompt}),
            contentType='application/json'
        )

        result = json.loads(response['body'].read())

        return {
            'statusCode': 200,
            'headers': { 'Content-Type': 'application/json' },
            'body': json.dumps(result, ensure_ascii=False)
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
