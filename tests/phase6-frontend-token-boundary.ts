import aegisApi from "../src/data/aegisApi.ts";

type FetchCall = {
  url: string;
  init?: RequestInit;
};

const calls: FetchCall[] = [];

function jsonResponse(status: number, data: any) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

function installFetch(status: number, data: any) {
  calls.length = 0;
  (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return jsonResponse(status, data);
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function lastCall() {
  const call = calls[calls.length - 1];
  if (!call) throw new Error("Expected fetch to be called");
  return call;
}

function assertNoTokenInRequest(call: FetchCall) {
  const serialized = JSON.stringify({
    url: call.url,
    body: call.init?.body,
  });
  assert(!serialized.includes("Bearer"), "Bearer token appeared in URL or request body");
  assert(!serialized.includes("phase6-test-token"), "Token value appeared in URL or request body");
}

async function main() {
  console.log("=== PHASE 6: FRONTEND TOKEN BOUNDARY TEST ===");

  installFetch(401, { error: "Unauthorized", reason: "AEGIS_API_AUTH_REQUIRED" });

  const ledger = await aegisApi.getLedger();
  assert(ledger.source === "UNAVAILABLE", "401 ledger response was not represented as unavailable");
  assert(Array.isArray(ledger.events) && ledger.events.length === 0, "401 ledger response returned fixture/simulated events");
  assert((ledger as any).authRequired === true, "401 ledger response did not preserve auth-required state");
  assertNoTokenInRequest(lastCall());

  const verify = await aegisApi.verifyChain();
  assert(verify.source === "UNAVAILABLE", "401 verify response was not represented as unavailable");
  assert(verify.verified === false && verify.ok === 0 && verify.total === 0, "401 verify response was converted into simulated verification");

  const investigation = await aegisApi.investigate("evt_frontend_auth_test");
  assert(investigation.source === "UNAVAILABLE", "401 investigation was not represented as unavailable");
  assert(investigation.status === "failed", "401 investigation was not represented as failed");
  assert(investigation.analysis.refs.length === 0, "401 investigation returned fixture references");
  assertNoTokenInRequest(lastCall());

  const policy = await aegisApi.getPolicy();
  assert(policy.source === "UNAVAILABLE", "401 policy response was not represented as unavailable");
  assert(policy.sourceText === "", "401 policy response exposed policy content");

  const invoke = await aegisApi.invoke("fs", "fs:read", "package.json", "TRUSTED");
  assert(invoke.source === "UNAVAILABLE", "401 invoke response was not represented as unavailable");
  assert(invoke.ok === false, "401 invoke response was converted into success");
  assert(!invoke.decision, "401 invoke response produced a simulated decision");
  const invokeCall = lastCall();
  const body = JSON.parse(String(invokeCall.init?.body || "{}"));
  assert(body.contractId === "tc_devfix_dependency_remediation_v1", "Frontend invoke body omitted contractId");
  assert(body.resource === "package.json", "Frontend invoke body resource changed unexpectedly");
  assertNoTokenInRequest(invokeCall);

  const headers = invokeCall.init?.headers as Record<string, string>;
  assert(!headers?.Authorization, "Missing VITE token should not fabricate an Authorization header");

  installFetch(200, {
    source: "LOCAL",
    securityCore: { pep: "LOCAL" },
    aws: [],
  });
  const status = await aegisApi.getStatus();
  assert(status.source === "LOCAL", "Public status route should continue to work without protected-route token semantics");

  console.log("PASS: Frontend 401 handling stays unavailable/auth-required and never fabricates protected Aegis data.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
