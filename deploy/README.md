# Aegis Phase 8 ECS/Fargate Deployment Readiness

Phase 8 packages the current Aegis Express backend as a single ECS/Fargate task behind an Application Load Balancer. This is a deployment-readiness artifact for the current backend, not a redesign of Aegis.

## Boundary

- The service remains the existing Express PEP.
- Desired ECS task count is `1` for the Phase 8 proof because the evidence ledger is process-local.
- Task restart resets the in-memory ledger.
- DynamoDB and S3 may receive archival writes when AWS credentials, IAM, and resources are configured, but `/api/agent/sessions/:sessionId/reconstruct` does not reconstruct from DynamoDB or S3.
- EventBridge remains a publisher path only. No EventBridge consumer architecture is implemented.
- Bedrock remains post-hoc only and requires `BEDROCK_MODEL_ID`.
- The filesystem executor operates on repository artifacts packaged into the Aegis container. This deployment does not claim general sandbox or host-filesystem isolation.

## Container

Build locally:

```bash
docker build -t aegis:phase8 .
```

Run locally with a demo API token:

```bash
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e AEGIS_API_TOKEN=phase8-local-demo-token \
  -e AWS_EC2_METADATA_DISABLED=true \
  -e AEGIS_AWS_ARCHIVAL_TIMEOUT_MS=1000 \
  -e AEGIS_AVP_TIMEOUT_MS=1000 \
  aegis:phase8
```

Expected proof:

```bash
curl http://localhost:3000/api/health
curl -i http://localhost:3000/api/agent/ledger
curl -i -H "Authorization: Bearer phase8-local-demo-token" http://localhost:3000/api/agent/ledger
```

## ECS/Fargate

`deploy/ecs-fargate-alb.yaml` defines:

- ECS cluster
- Fargate task definition
- desired count `1`
- Application Load Balancer
- target group and `/api/health` health check
- task execution role
- task IAM role for the current AWS SDK paths
- Secrets Manager injection for `AEGIS_API_TOKEN`

The task role grants only the current application paths where practical:

- `verifiedpermissions:IsAuthorized`
- `events:PutEvents`
- `dynamodb:PutItem`
- `s3:PutObject`
- `s3:PutObjectRetention`
- `bedrock:InvokeModel` only when `BedrockModelArn` is supplied

`BedrockModelArn` defaults to blank. When blank, the task role receives no Bedrock invoke permission and investigation remains degraded unless `BEDROCK_MODEL_ID` and a matching model ARN are configured.

## Configuration

Required for protected backend routes:

- `AEGIS_API_TOKEN`: supplied at runtime, preferably through Secrets Manager injection.

Optional or degraded if missing:

- `PORT`: defaults to `3000`.
- `AWS_REGION`: defaults to `us-east-1`; use the region containing Aegis AWS resources.
- `AVP_POLICY_STORE_ID`: missing/unconfigured degrades to local Cedar fallback.
- `AEGIS_EVENT_BUS`: defaults to `default`.
- `AEGIS_DYNAMODB_TABLE`: defaults to `AegisEvidence`.
- `AEGIS_S3_BUCKET`: missing/wrong bucket records degraded archival.
- `BEDROCK_MODEL_ID`: missing returns a safe post-hoc investigation degradation.

Do not bake AWS access keys, session tokens, or real API tokens into the image.

## UI Boundary

Phase 8 does not modify the UI. Prefer same-origin access for this deployment proof. If the UI remains separately hosted, cross-origin integration and narrowly scoped CORS belong to a later UI integration phase.
