// lib/nexus-stack.ts
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

export class NexusStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Cognito User Pool (Minimal JWT Setup)
    const userPool = new cognito.UserPool(this, 'TenantUserPool', {
      userPoolName: 'TenantUserPool',
      selfSignUpEnabled: false,
      customAttributes: {
        tenantId: new cognito.StringAttribute({ mutable: false }),
      },
    });

    const authorizer = new apigw.CognitoUserPoolsAuthorizer(this, 'UserPoolAuthorizer', {
      cognitoUserPools: [userPool],
    });

    // Python Lambda summarizer
    const summarizerLambda = new lambda.Function(this, 'SummarizerLambda', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'app.lambda_handler',
      memorySize: 512,
      timeout: Duration.seconds(10),
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/src/summarizer'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
          ]
        }
      }),
      environment: {
        MODEL_ID: 'anthropic.claude-3-5-haiku',
        REGION: this.region,
      },
    });

    // Permissions for Bedrock
    summarizerLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));

    // API Gateway
    const api = new apigw.RestApi(this, 'SummarizerApi', {
      restApiName: 'SummarizerApi',
    });

    const summarize = api.root.addResource('summarize');
    summarize.addMethod('POST', new apigw.LambdaIntegration(summarizerLambda), {
      authorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    });
  }
}
