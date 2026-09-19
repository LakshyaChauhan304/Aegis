import crypto from "crypto";

const CONTRACT_ID = "tc_devfix_dependency_remediation_v1";
const runSessionId = "sess_contract_" + Date.now();

async function json(path: string, init?: RequestInit) {
  const res = await fetch(`http://localhost:3000${path}`, init);
  const data = await res.json();
  return { res, data };
}

function requestBody(overrides: Record<string, any> = {}) {
  return {
    sessionId: runSessionId,
    agentId: "DevFix",
    contractId: CONTRACT_ID,
    tool: "fs",
    action: "fs:read",
    resource: "package.json",
    context: { trust: "TRUSTED" },
    ...overrides,
  };
}

async function invoke(overrides: Record<string, any> = {}) {
  return json("/api/agent/invoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody(overrides)),
  });
}

function sortKeysRecursive(obj: any): any {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortKeysRecursive);
  const result: Record<string, any> = {};
  for (const key of Object.keys(obj).sort()) {
    result[key] = sortKeysRecursive(obj[key]);
  }
  return result;
}

function canonicalize(event: any) {
  const { hash, ...unhashed } = event;
  return JSON.stringify(sortKeysRecursive(unhashed));
}

function verifyLedger(chain: any[]) {
  let previousHash = "GENESIS";
  for (const [index, event] of chain.entries()) {
    if (event.previousHash !== previousHash) {
      throw new Error(`Chain broken at ${index}`);
    }
    const computed = crypto.createHash("sha256").update(canonicalize(event)).digest("hex");
    if (computed !== event.hash) {
      throw new Error(`Hash mismatch at ${index}`);
    }
    previousHash = event.hash;
  }
}

async function main() {
  console.log("=== PHASE 8: TASK CONTRACT ENFORCEMENT TEST ===");

  const missingBody = requestBody();
  delete (missingBody as any).contractId;
  const missing = await json("/api/agent/invoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(missingBody),
  });
  if (missing.res.status !== 400 || missing.data.executionState !== "NOT_EXECUTED") {
    throw new Error(`Missing contractId should fail malformed with no execution, got ${missing.res.status}`);
  }

  const unknown = await invoke({ contractId: "tc_unknown" });
  if (unknown.res.status !== 403 || unknown.data.decision?.decision !== "DENY" || unknown.data.executionState !== "NOT_EXECUTED") {
    throw new Error("Unknown contract did not fail closed");
  }

  const wrongAgent = await invoke({ agentId: "OtherAgent" });
  if (wrongAgent.res.status !== 403 || wrongAgent.data.decision?.decision !== "DENY") {
    throw new Error("Wrong agent was not denied");
  }

  const wrongSession = await invoke({ sessionId: "unbound-session" });
  if (wrongSession.res.status !== 403 || wrongSession.data.decision?.decision !== "DENY") {
    throw new Error("Wrong session was not denied");
  }

  const outOfScope = await invoke({ resource: "README.md" });
  if (outOfScope.res.status !== 403 || outOfScope.data.decision?.decision !== "DENY") {
    throw new Error("Out-of-scope resource was not denied");
  }

  const unsupported = await invoke({ tool: "shell", action: "shell:exec", resource: "npm audit --json" });
  if (unsupported.res.status !== 403 || unsupported.data.executionState !== "NOT_EXECUTED") {
    throw new Error("Unsupported tool/action was not denied before execution");
  }

  const invalidTrust = await invoke({ resource: "node_modules/axios/README.md", context: { trust: "TRUSTED" } });
  if (invalidTrust.res.status !== 403 || invalidTrust.data.decision?.decision !== "DENY" || invalidTrust.data.executionState !== "NOT_EXECUTED") {
    throw new Error("Invalid trust context was not denied before execution");
  }

  const allow = await invoke();
  if (allow.res.status !== 200 || allow.data.decision?.decision !== "ALLOW" || allow.data.executionState !== "EXECUTED") {
    throw new Error("Valid contract package.json read did not execute");
  }

  const packageLock = await invoke({ resource: "package-lock.json" });
  if (packageLock.res.status !== 200 || packageLock.data.decision?.decision !== "ALLOW" || packageLock.data.executionState !== "EXECUTED") {
    throw new Error("Valid contract package-lock.json read did not execute");
  }

  const env = await invoke({ resource: ".env", context: { trust: "UNTRUSTED_EXTERNAL" } });
  if (env.res.status !== 403 || env.data.decision?.decision !== "DENY" || env.data.executionState !== "NOT_EXECUTED" || env.data.bytesReturned !== 0 || env.data.result) {
    throw new Error(".env denial semantics regressed");
  }

  const axios = await invoke({ resource: "node_modules/axios/README.md", context: { trust: "UNTRUSTED_EXTERNAL" } });
  if (axios.res.status !== 200 || axios.data.decision?.decision !== "ALLOW" || axios.data.executionState !== "EXECUTED") {
    throw new Error("UNTRUSTED_EXTERNAL axios README read did not remain allowed under contract");
  }

  const ledgerResponse = await json("/api/agent/ledger");
  const ledger = ledgerResponse.data;
  verifyLedger(ledger);

  const contractEvents = ledger.filter((event: any) => event.sessionId === runSessionId);
  if (contractEvents.length < 9) {
    throw new Error(`Expected recorded contract events, got ${contractEvents.length}`);
  }

  for (const event of contractEvents) {
    if (!event.contractId || !event.contractVersion || !event.contractHash || !event.contractValidation) {
      throw new Error("Evidence event missing contract metadata");
    }
  }

  const allowEvent = contractEvents.find((event: any) => event.eventId === allow.data.decision.eventId);
  if (!allowEvent || allowEvent.contractValidation.status !== "VALID") {
    throw new Error("Valid authorization did not record VALID contract validation");
  }

  const deniedEnvEvent = contractEvents.find((event: any) => event.eventId === env.data.decision.eventId);
  if (!deniedEnvEvent || deniedEnvEvent.contractValidation.status !== "OUT_OF_SCOPE_RESOURCE") {
    throw new Error(".env denial did not record contract scope failure");
  }

  const ledgerText = JSON.stringify(contractEvents);
  if (ledgerText.includes("react-example") || ledgerText.includes("SECRET")) {
    throw new Error("Protected file contents leaked into evidence");
  }

  console.log("PASS: Task Contract boundary fails closed and records contract evidence.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});