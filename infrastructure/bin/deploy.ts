import { App } from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack';
import { DataStack } from '../lib/data-stack';
import { ServiceStack } from '../lib/service-stack';

const app = new App();

// Deploy in order: Auth -> Data -> Service (service depends on the others)
const authStack = new AuthStack(app, 'SummarizerAuthStack');
const dataStack = new DataStack(app, 'SummarizerDataStack');
new ServiceStack(app, 'SummarizerServiceStack', {
  auth: authStack,
  data: dataStack
});