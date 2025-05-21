import {
  Stack,
  StackProps,
  Duration,
  aws_lambda as lambda,
  aws_apigateway as apigateway,
  aws_iam as iam,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AuthStack } from './auth-stack';
import { DataStack } from './data-stack';
import * as path from 'path';

/**
 * Props expected by ServiceStack
 */
export interface ServiceStackProps extends StackProps {
  readonly auth: AuthStack;
  readonly data: DataStack;
}

/**
 * Resolve the absolute path to the summarizer Lambda directory.
 * Works both when executing via ts-node (local synth) and after
 * TypeScript compilation (dist structure changes).
 */
function summarizerAssetPath(): string {
  // __dirname === infrastructure/lib at synth‑time (ts-node) or dist/lib at runtime.
  // Navigate two levels up to repo root, then into services/summarizer.
  return path.resolve(__dirname, '..', '..', 'services', 'summarizer');
}

/**
 * ServiceStack – defines API Gateway, Lambda (Python), and IAM wiring.
 */
export class ServiceStack extends Stack {
  constructor(scope: Construct, id: string, props: ServiceStackProps) {
    super(scope, id, props);

    // 1. Python Lambda Function (Summarizer)
    const summarizerLambda = new lambda.Function(this, 'SummarizerFunction', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'app.lambda_handler',
      code: lambda.Code.fromAsset(summarizerAssetPath()),
      memorySize: 512,
      timeout: Duration.seconds(10),
      vpc: props.data.vpc,
      environment: {
        MODEL_ID: 'anthropic.claude-3-5',
        CONFIG_TABLE: props.data.tenantTable.tableName,
        PROMPT_BUCKET: props.data.promptBucket.bucketName,
        REGION: this.region,
        // REDIS_HOST/PORT can be injected later via addEnvironment
      },
    });

    // IAM permissions
    summarizerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: ['*'], // TODO: scope to model ARN in prod
      }),
    );
    props.data.tenantTable.grantReadData(summarizerLambda);
    props.data.promptBucket.grantRead(summarizerLambda);

    // 2. API Gateway + Cognito Authorizer
    const api = new apigateway.RestApi(this, 'SummarizerApi', {
      restApiName: 'SummarizerService',
      endpointConfiguration: { types: [apigateway.EndpointType.REGIONAL] },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'ApiAuthorizer', {
      cognitoUserPools: [props.auth.userPool],
    });

    api.root.addResource('summarize').addMethod(
      'POST',
      new apigateway.LambdaIntegration(summarizerLambda),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      },
    );
  }
}
