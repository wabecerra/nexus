import { Stack, StackProps, aws_dynamodb as dynamodb, aws_s3 as s3, aws_elasticache as elasticache, aws_ec2 as ec2 } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class DataStack extends Stack {
  public readonly tenantTable: dynamodb.Table;
  public readonly promptBucket: s3.Bucket;
  public readonly vpc: ec2.Vpc;
  public readonly redisCluster: elasticache.CfnCacheCluster;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'SummarizerVpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC },
        { name: 'Private', subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
      ],
    });

    this.tenantTable = new dynamodb.Table(this, 'TenantConfigs', {
      partitionKey: { name: 'TenantID', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: undefined // CHANGE for production
    });

    this.promptBucket = new s3.Bucket(this, 'PromptBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: undefined // CHANGE for production
    });

    this.redisCluster = new elasticache.CfnCacheCluster(this, 'RedisCluster', {
      cacheNodeType: 'cache.t3.micro',
      engine: 'redis',
      numCacheNodes: 1,
      vpcSecurityGroupIds: [], // Should add a security group for Lambda
      cacheSubnetGroupName: new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
        description: 'Subnet group for Redis',
        subnetIds: this.vpc.privateSubnets.map(s => s.subnetId),
      }).ref,
    });
  }
}