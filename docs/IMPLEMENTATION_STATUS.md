# Implementation Status

Current checkpoint before Phase 4A changes: `bb50229`.

## Runtime Core

| Component | Implementation | Verification | Evidence |
| :--- | :--- | :--- | :--- |
| Tool call interface | IMPLEMENTED | VERIFIED | `/api/agent/invoke` |
| Local Cedar evaluation | IMPLEMENTED | VERIFIED | `server/policies/devfix.cedar` |
| .env protection | IMPLEMENTED | VERIFIED | DENY returns HTTP 403 before file read |
| Evidence ledger | IMPLEMENTED | VERIFIED | Process-local SHA-256 linear hash chain; immutable primary events record contract, normalized operation, authorization, execution, byte count, HTTP status, and executor identity; archival outcomes are separate receipt events linked to primary event hashes |
| Session reconstruction | IMPLEMENTED | VERIFIED BY TEST | `/api/agent/sessions/:sessionId/reconstruct` returns ordered session events and global ledger verification result |
| Shell execution | NOT IMPLEMENTED | VERIFIED UNAVAILABLE | Unsupported action returns no execution result |
| Network enforcement | NOT IMPLEMENTED | NOT APPLICABLE | No network tool exists |
| Trusted local Task Contract enforcement | IMPLEMENTED | VERIFIED BY TEST | `contractId` resolves against backend registry before Cedar/AVP authorization |
| Normalized authorization request | IMPLEMENTED | VERIFIED BY TEST | Backend normalizes principal/session/contract/tool/action/resource/argument metadata before Cedar/AVP authorization |
| Static tool executor registry | IMPLEMENTED | VERIFIED BY TEST | Registry contains only `fs:fs:read`; authorization still occurs before executor lookup |
| Argument execution | NOT IMPLEMENTED | VERIFIED UNAVAILABLE | Arguments are represented by presence/redaction/hash metadata; unexpected current `fs:read` arguments fail closed |
| Signed/KMS Task Contract verification | NOT IMPLEMENTED | NOT APPLICABLE | No cryptographic signature, HMAC, or KMS verification is implemented |
| KMS-backed signing | NOT IMPLEMENTED | NOT APPLICABLE | KMS is not used by runtime code |
| API Gateway/Lambda | NOT IMPLEMENTED | NOT LIVE | Current backend is local Express |

## Phase 4A AWS Resources

| Service | Repository path | Resource state | App path state | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| Amazon Verified Permissions | `server/pep.ts` | CREATED | HISTORICALLY LIVE-VERIFIED; CURRENT RUN DEGRADED WITHOUT CREDENTIALS | Historical check with `AWS_PROFILE=aegis`: policy store `4VKzAMGEYyBg3ZkcpULube`; direct AWS MCP `IsAuthorized` returned package.json ALLOW and .env DENY |
| EventBridge default bus | `server/aws-archiver.ts` | AVAILABLE | HISTORICALLY LIVE-VERIFIED; CURRENT RUN DEGRADED WITHOUT CREDENTIALS | Historical check with `AWS_PROFILE=aegis`: AWS MCP `PutEvents` succeeded on `default`, event ID `bf726887-57d2-36af-6468-b11ed2ed2cb3` |
| DynamoDB | `server/aws-archiver.ts` | CREATED | HISTORICALLY LIVE-VERIFIED; CURRENT RUN DEGRADED WITHOUT CREDENTIALS | Historical check with `AWS_PROFILE=aegis`: table `AegisEvidence`; AWS MCP read-back matched event ID/hash/decision |
| S3 Object Lock | `server/aws-archiver.ts` | CREATED | HISTORICALLY LIVE-VERIFIED; CURRENT RUN DEGRADED WITHOUT CREDENTIALS | Historical check with `AWS_PROFILE=aegis`: bucket `aegis-evidence-643220021031-ap-southeast-2`; object version and COMPLIANCE retention observed |
| Amazon Bedrock | `server/bedrock-investigator.ts` | ACTIVE PROFILES INSPECTED | CONFIGURABLE, blocked by account model-access/use-case requirement | `BEDROCK_MODEL_ID` is required for invocation; no hardcoded model fallback remains |

## Important Boundaries

- Evidence is a SHA-256 linear hash chain, not a Merkle tree.
- EventBridge is a publisher only in the current implementation; no consumer or event-driven archival pipeline is implemented.
- DynamoDB and S3 archival are direct post-execution SDK writes in `server/aws-archiver.ts`.
- AWS archival outcomes are summarized in separate local receipt events as `ARCHIVAL_SUCCESS`, `ARCHIVAL_PARTIAL`, or `ARCHIVAL_FAILED`; live archival still requires valid AWS credentials and configured resources.
- Bedrock is post-hoc only and never participates in ALLOW/DENY decisions.
- Local Cedar remains the fallback/reference policy; AVP mismatch fails closed.
- No credentials, access keys, session tokens, or passwords are committed.
