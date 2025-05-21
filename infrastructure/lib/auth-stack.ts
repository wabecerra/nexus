import { Stack, StackProps, aws_cognito as cognito } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class AuthStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, 'TenantUserPool', {
      userPoolName: 'TenantUserPool',
      selfSignUpEnabled: false,
      standardAttributes: {
        email: { required: true, mutable: false },
      },
      customAttributes: {
        tenantId: new cognito.StringAttribute({ mutable: false }),
      },
      passwordPolicy: { minLength: 8, requireSymbols: true },
      removalPolicy: undefined // CHANGE for production
    });

    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      generateSecret: false,
      authFlows: { userPassword: true },
    });
  }
}