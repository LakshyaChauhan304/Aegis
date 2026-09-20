import { authHeaders, TEST_API_TOKEN } from "./test-auth.ts";
import { getLastInvestigationResult } from "../server/bedrock-investigator.ts";
import { getExecutorExecutionCounts, resetExecutorExecutionCounts } from "../server/tool-executors.ts";

const CONTRACT_ID = "tc_devfix_dependency_remediation_v1";
const sessionId = "sess_hardening_" + Date.now();

function requestBody(resource = "package.json", trust = "TRUSTED") {
  return {
    sessionId,
    agentId: "DevFix",
    contractId: CONTRACT_ID,
    tool: "fs",
    action: "fs:read",
    resource,
    context: { trust, source: "phase6-api-auth-test" },
  };
}

async function json(path: string, init?: RequestInit) {
  const res = await fetch(`http://localhost:3000${path}`, init);
  const data = await res.json().catch(() => null);
  return { res, data };
}

async function authorizedJson(path: string, init?: RequestInit) {
  return json(path, {
    ...(init || {}),
    headers: authHeaders(init?.headers as Record<string, string> | undefined),
  });
}

async function authorizedLedgerCount() {
  const ledger = await authorizedJson("/api/agent/ledger");
  if (ledger.res.status !== 200 || !Array.isArray(ledger.data)) {
    throw new Error(`Could not read authorized ledger: ${ledger.res.status}`);
  }
  return ledger.data.length;
}

async function unauthorizedInvoke(headers?: Record<string, string>) {
  return json("/api/agent/invoke", {
    method: "POST",
    headers: {
      ...(headers || {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody()),
  });
}

function assertUnauthorized(label: string, response: { res: Response; data: any }) {
  if (response.res.status !== 401) {
    throw new Error(`${label} should return 401, got ${response.res.status}`);
  }
  const serialized = JSON.stringify(response.data || {});
  if (serialized.includes(TEST_API_TOKEN) || serialized.includes("wrong-token")) {
    throw new Error(`${label} leaked token material in response`);
  }
  if (serialized.includes("Aegis::Agent")) {
    throw new Error(`${label} exposed protected policy/source content`);
  }
}

async function main() {
  console.log("=== PHASE 6: API TRUST BOUNDARY TEST ===");

  const before = await authorizedLedgerCount();
  resetExecutorExecutionCounts();
  const investigationBefore = getLastInvestigationResult();

  assertUnauthorized("invoke without token", await unauthorizedInvoke());
  assertUnauthorized("invoke with wrong token", await unauthorizedInvoke({ Authorization: "Bearer wrong-token" }));
  assertUnauthorized("invoke with malformed Authorization", await unauthorizedInvoke({ Authorization: `Basic ${TEST_API_TOKEN}` }));
  assertUnauthorized("ledger without token", await json("/api/agent/ledger"));
  assertUnauthorized("ledger verify without token", await json("/api/agent/ledger/verify"));
  assertUnauthorized("reconstruction without token", await json(`/api/agent/sessions/${encodeURIComponent(sessionId)}/reconstruct`));
  assertUnauthorized("investigation without token", await json("/api/agent/investigate/evt_missing"));
  assertUnauthorized("policy without token", await json("/api/aegis/policy"));

  const afterUnauthorized = await authorizedLedgerCount();
  if (afterUnauthorized !== before) {
    throw new Error(`Unauthorized requests created evidence events: before=${before}, after=${afterUnauthorized}`);
  }
  if (Object.keys(getExecutorExecutionCounts()).length !== 0) {
    throw new Error("Unauthorized invoke executed a tool");
  }
  if (getLastInvestigationResult() !== investigationBefore) {
    throw new Error("Unauthorized investigation changed Bedrock investigation state");
  }

  const allow = await authorizedJson("/api/agent/invoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody("package.json", "TRUSTED")),
  });
  if (allow.res.status !== 200 || allow.data.decision?.decision !== "ALLOW" || allow.data.executionState !== "EXECUTED") {
    throw new Error("Authorized package.json request did not preserve ALLOW/EXECUTED behavior");
  }

  const deny = await authorizedJson("/api/agent/invoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody(".env", "UNTRUSTED_EXTERNAL")),
  });
  if (deny.res.status !== 403 || deny.data.decision?.decision !== "DENY" || deny.data.executionState !== "NOT_EXECUTED" || deny.data.bytesReturned !== 0 || deny.data.result) {
    throw new Error("Authorized .env request did not preserve DENY/NOT_EXECUTED/0-byte behavior");
  }

  const policy = await authorizedJson("/api/aegis/policy");
  if (policy.res.status !== 200 || !policy.data?.sourceText?.includes("Aegis::Agent")) {
    throw new Error("Authorized policy request did not return current policy source");
  }

  const ledger = await authorizedJson("/api/agent/ledger");
  if (ledger.res.status !== 200 || !Array.isArray(ledger.data)) {
    throw new Error("Authorized ledger request failed");
  }

  const verify = await authorizedJson("/api/agent/ledger/verify");
  if (verify.res.status !== 200 || verify.data.valid !== true) {
    throw new Error("Authorized ledger verification request failed");
  }

  const session = await authorizedJson(`/api/agent/sessions/${encodeURIComponent(sessionId)}/reconstruct`);
  if (session.res.status !== 200 || session.data.sessionId !== sessionId || session.data.verification?.valid !== true) {
    throw new Error("Authorized reconstruction request failed");
  }

  const investigation = await authorizedJson(`/api/agent/investigate/${deny.data.eventId}`);
  if (investigation.res.status !== 200 || !investigation.data.investigationStatus) {
    throw new Error("Authorized investigation request failed to reach post-hoc Bedrock boundary");
  }

  const afterAuthorized = await authorizedLedgerCount();
  if (afterAuthorized <= afterUnauthorized) {
    throw new Error("Authorized invoke requests did not create evidence");
  }

  console.log("PASS: Protected API routes require bearer auth before side effects and preserve authorized behavior.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
