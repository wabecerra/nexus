#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { NexusStack } from '../lib/nexus-stack';

const app = new cdk.App();
new NexusStack(app, 'NexusStack', {
  env: { region: 'us-west-2' },
});
