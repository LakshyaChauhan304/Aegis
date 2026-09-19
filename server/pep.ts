import fs from "fs";
import path from "path";
import "dotenv/config";
import * as cedar from "@cedar-policy/cedar-wasm";
import { VerifiedPermissionsClient, IsAuthorizedCommand } from "@aws-sdk/client-verifiedpermissions";
import { globalLedger } from "./ledger.js";
import { ArchivalResults } from "./aws-archiver.js";
import { ContractValidation, NormalizedAuthorizationRequest, ToolRequest, normalizeToolRequest, validateTaskContract } from "./task-contracts.js";

export type { ToolRequest, NormalizedAuthorizationRequest };

function isNormalizedRequest(request: NormalizedAuthorizationRequest | ToolRequest): request is NormalizedAuthorizationRequest {
  return typeof (request as NormalizedAuthorizationRequest).operation === "object";
}

export type Decision = {
  decision: "ALLOW" | "DENY";
  reason: string;
  policyId?: string;
  eventId: string;
  hash: string;
  archivalStatus?: ArchivalResults;
  contractValidation: ContractValidation;
};

// Load the local Cedar policy
const policyPath = path.join(process.cwd(), "server/policies/devfix.cedar");
const policyString = fs.readFileSync(policyPath, "utf8");

const avpClient = new VerifiedPermissionsClient({
  region: process.env.AWS_REGION || "us-east-1"
});

function parseTimeoutMs(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const avpTimeoutMs = parseTimeoutMs(
  process.env.AEGIS_AVP_TIMEOUT_MS || process.env.AEGIS_AWS_SDK_TIMEOUT_MS,
  5000
);

async function sendWithTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } catch (err: any) {
    if (controller.signal.aborted) {
      throw new Error(`AVP request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function buildAuthorizationContext(request: NormalizedAuthorizationRequest, contractValidation: ContractValidation) {
  return {
    trust: request.context.trust,
    source: request.context.source,
    sessionId: request.session.sessionId,
    contractId: contractValidation.contractId || request.contract.contractId || "unknown",
    contractVersion: contractValidation.contractVersion || "unknown",
    contractHash: contractValidation.contractHash || "unknown",
    contractValid: contractValidation.valid,
    contractValidationStatus: contractValidation.status,
    tool: request.operation.tool,
    normalizedAction: request.operation.action,
    resourceType: request.operation.resource.type,
    resourceId: request.operation.resource.id,
    argumentsHash: request.operation.arguments.hash,
    argumentsPresent: request.operation.arguments.present,
    argumentsRedacted: request.operation.arguments.redacted,
  };
}

function evaluateLocalCedar(request: NormalizedAuthorizationRequest, contractValidation: ContractValidation) {
  const principal = { type: "Aegis::Agent", id: request.principal.agentId };
  const action = { type: "Aegis::Action", id: request.operation.actionId };
  const resource = { type: "Aegis::File", id: request.operation.resource.id };
  const context = buildAuthorizationContext(request, contractValidation);

  const entities = [
    { uid: principal, attrs: {}, parents: [] },
    { uid: action, attrs: {}, parents: [] },
    { uid: resource, attrs: {}, parents: [] }
  ];

  const policiesObj: Record<string, string> = {};
  const splitPolicies = policyString.split(/\/\/\s*\d+\.\s*[^\n]+/).filter(Boolean);
  splitPolicies.forEach((pol, idx) => {
    if (pol.trim()) policiesObj[`policy_${idx}`] = pol.trim();
  });

  try {
    const callResult = cedar.isAuthorized({
      principal: { type: principal.type, id: principal.id },
      action: { type: action.type, id: action.id },
      resource: { type: resource.type, id: resource.id },
      context,
      entities,
      policies: { staticPolicies: policiesObj }
    });

    console.log("Local Cedar Result:", JSON.stringify(callResult, null, 2));

    const decision = callResult.type === "success" && callResult.response?.decision === "allow" ? "ALLOW" : "DENY";
    const reason = callResult.type === "success" && callResult.response?.decision === "allow"
      ? `Authorized by ${callResult.response.diagnostics.reason.join(", ")}`
      : contractValidation.valid
        ? (callResult.type === "failure" ? callResult.errors.map(e => e.message).join(", ") : "Denied by local policy")
        : `CONTRACT_VALIDATION_FAILED: ${contractValidation.status}`;

    return { decision, reason };
  } catch (err: any) {
    console.error("Local Cedar authorization error:", err);
    return { decision: "DENY", reason: "INTERNAL_ERROR" };
  }
}

async function evaluateAVP(request: NormalizedAuthorizationRequest, contractValidation: ContractValidation) {
  const policyStoreId = process.env.AVP_POLICY_STORE_ID || "UNCONFIGURED_STORE_ID";
  const contractContext = buildAuthorizationContext(request, contractValidation);
  const cmd = new IsAuthorizedCommand({
    policyStoreId,
    principal: { entityType: "Aegis::Agent", entityId: request.principal.agentId },
    action: { actionType: "Aegis::Action", actionId: request.operation.actionId },
    resource: { entityType: "Aegis::File", entityId: request.operation.resource.id },
    context: {
      contextMap: {
        trust: { string: contractContext.trust },
        source: { string: contractContext.source },
        sessionId: { string: contractContext.sessionId },
        contractId: { string: contractContext.contractId },
        contractVersion: { string: contractContext.contractVersion },
        contractHash: { string: contractContext.contractHash },
        contractValid: { boolean: contractContext.contractValid },
        contractValidationStatus: { string: contractContext.contractValidationStatus },
        tool: { string: contractContext.tool },
        normalizedAction: { string: contractContext.normalizedAction },
        resourceType: { string: contractContext.resourceType },
        resourceId: { string: contractContext.resourceId },
        argumentsHash: { string: contractContext.argumentsHash },
        argumentsPresent: { boolean: contractContext.argumentsPresent },
        argumentsRedacted: { boolean: contractContext.argumentsRedacted },
      }
    }
  });

  const response = await sendWithTimeout(
    (abortSignal) => avpClient.send(cmd, { abortSignal }),
    avpTimeoutMs
  );

  const decision = response.decision === "ALLOW" ? "ALLOW" : "DENY";
  const reason = (response.determiningPolicies && response.determiningPolicies.length > 0) ? "Matched AVP policy" : "Denied by AVP";

  return { decision: decision as "ALLOW" | "DENY", reason, policyStoreId };
}

export async function authorize(rawRequest: NormalizedAuthorizationRequest | ToolRequest): Promise<Decision> {
  const request = isNormalizedRequest(rawRequest) ? rawRequest : normalizeToolRequest(rawRequest);
  const contractValidation = validateTaskContract(request);

  // 1. Local Cedar Evaluation
  const localResult = evaluateLocalCedar(request, contractValidation);

  // 2. Amazon Verified Permissions Evaluation
  let finalDecision: "ALLOW" | "DENY" = "DENY";
  let finalReason = "";
  let provider = "";
  let avpError = "";
  let policyStoreId: string | undefined = undefined;

  try {
    const avpResult = await evaluateAVP(request, contractValidation);
    policyStoreId = avpResult.policyStoreId;

    // 3. Comparison
    if (localResult.decision !== avpResult.decision) {
      console.error(`[AEGIS PEP] AUTHORIZATION MISMATCH: Local Cedar says ${localResult.decision}, AVP says ${avpResult.decision}`);
      finalDecision = "DENY";
      finalReason = "AUTHORIZATION_MISMATCH_ERROR";
      provider = "amazon-verified-permissions";
    } else {
      finalDecision = avpResult.decision;
      finalReason = avpResult.reason;
      provider = "amazon-verified-permissions";
    }
  } catch (err: any) {
    if (process.env.DEBUG_AEGIS_PEP) {
      console.warn(`[AEGIS PEP] AVP Unavailable, falling back to Local Cedar. Error: ${err.message}`);
    }
    finalDecision = localResult.decision as "ALLOW" | "DENY";
    finalReason = localResult.reason;
    provider = "local-cedar";
    avpError = err.message;
  }

  // 4. Record Evidence locally
  const event = globalLedger.appendEvent({
    sessionId: request.session.sessionId || "unknown-session",
    agentId: request.principal.agentId || "unknown-agent",
    contractId: contractValidation.contractId || request.contract.contractId || "unknown-contract",
    contractVersion: contractValidation.contractVersion || "unknown",
    contractHash: contractValidation.contractHash || "unknown",
    contractValidation: {
      status: contractValidation.status,
      valid: contractValidation.valid,
      reason: contractValidation.reason,
    },
    tool: request.operation.tool,
    normalizedAction: request.operation.action,
    resourceType: request.operation.resource.type,
    resourceId: request.operation.resource.id,
    argumentsHash: request.operation.arguments.hash,
    argumentsPresent: request.operation.arguments.present,
    argumentsRedacted: request.operation.arguments.redacted,
    action: request.operation.actionId,
    resource: request.operation.resource.id,
    context: request.context,
    decision: finalDecision,
    reason: finalReason,
    authorization: {
       provider,
       policyStoreId,
       error: avpError || undefined
    }
  });

  return {
    decision: finalDecision,
    reason: finalReason,
    eventId: event.eventId,
    hash: event.hash,
    contractValidation
  };
}
