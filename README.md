# Welcome to Nexus: Polyglot AWS Multi-Tenant Package

This service provides secure, multi-tenant summarization via API, backed by Amazon Bedrock.

* Authentication: Cognito + JWT
* Multi-tenancy: DynamoDB
* Prompt Templates: S3
* Caching: Redis (ElastiCache)
* Infrastructure as Code: AWS CDK (TypeScript)
* Lambda code: Python 3.11
See `/infrastructure/README.md` for infra details. See `/services/summarizer/README.md` for handler/local development.