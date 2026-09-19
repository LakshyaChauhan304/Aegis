import crypto from "crypto";
import path from "path";
import { buildAuthorizationContext } from "../server/pep.ts";
import { normalizeToolRequest, validateTaskContract, ToolRequest } from "../server/task-contracts.ts";

const CONTRACT_ID = "tc_devfix_dependency_remediation_v1";
const runSessionId = "sess_contract_" + Date.now();

async function json(apiPath: string, init?: RequestInit) {
  const res = await fetch(`http://localhost:3000${apiPath}`, init);
  const data = await res.json();
  return { res, data };
}

function requestBody(overrides: Record<string, any> = {}): ToolRequest {
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

function expectDenied(response: { res: Response; data: any }, label: string) {
  if (response.res.status !== 403 || response.data.decision?.decision !== "DENY" || response.data.executionState !== "NOT_EXECUTED") {
    throw new Error(`${label} did not fail closed`);
  }
}

async function main() {
  console.log("=== PHASE 9: NORMALIZED TOOL/ACTION AUTHORIZATION TEST ===");

  const packageJson = await invoke();
  if (packageJson.res.status !== 200 || packageJson.data.decision?.decision !== "ALLOW" || packageJson.data.executionState !== "EXECUTED") {
    throw new Error("Valid package.json read did not execute");
  }

  const packageLock = await invoke({ resource: "package-lock.json" });
  if (packageLock.res.status !== 200 || packageLock.data.decision?.decision !== "ALLOW" || packageLock.data.executionState !== "EXECUTED") {
    throw new Error("Valid package-lock.json read did not execute");
  }

  const axios = await invoke({ resource: "node_modules/axios/README.md", context: { trust: "UNTRUSTED_EXTERNAL" } });
  if (axios.res.status !== 200 || axios.data.decision?.decision !== "ALLOW" || axios.data.executionState !== "EXECUTED") {
    throw new Error("UNTRUSTED_EXTERNAL axios README read did not execute");
  }

  const env = await invoke({ resource: ".env", context: { trust: "UNTRUSTED_EXTERNAL" } });
  if (env.res.status !== 403 || env.data.decision?.decision !== "DENY" || env.data.executionState !== "NOT_EXECUTED" || env.data.bytesReturned !== 0 || env.data.result) {
    throw new Error(".env denial semantics regressed");
  }

  expectDenied(await invoke({ tool: "fs", action: "shell:exec", resource: "package.json" }), "tool/action mismatch fs + shell:exec");
  expectDenied(await invoke({ tool: "shell", action: "fs:read", resource: "package.json" }), "tool/action mismatch shell + fs:read");

  const unexpectedArguments = await invoke({
    arguments: ["unexpected", "do-not-leak-secret-value"],
  });
  expectDenied(unexpectedArguments, "unexpected arguments");

  const dotSlashEnv = await invoke({ resource: "./.env", context: { trust: "UNTRUSTED_EXTERNAL" } });
  expectDenied(dotSlashEnv, "./.env");

  const absoluteEnv = await invoke({
    resource: path.join(process.cwd(), ".env"),
    context: { trust: "UNTRUSTED_EXTERNAL" },
  });
  expectDenied(absoluteEnv, "absolute .env");

  const parentEnv = await invoke({ resource: "../.env", context: { trust: "UNTRUSTED_EXTERNAL" } });
  expectDenied(parentEnv, "../.env");

  const argsA = normalizeToolRequest(requestBody({ arguments: { z: 1, a: ["x", "y"] } }));
  const argsB = normalizeToolRequest(requestBody({ arguments: { a: ["x", "y"], z: 1 } }));
  if (argsA.operation.arguments.hash !== argsB.operation.arguments.hash || !argsA.operation.arguments.present || !argsA.operation.arguments.redacted) {
    throw new Error("Argument hashing is not deterministic and redacted");
  }

  const normalized = normalizeToolRequest(requestBody());
  const validation = validateTaskContract(normalized);
  const context = buildAuthorizationContext(normalized, validation);
  if (
    context.tool !== "fs" ||
    context.normalizedAction !== "read" ||
    context.resourceType !== "file" ||
    context.resourceId !== "package.json" ||
    context.argumentsPresent !== false ||
    context.argumentsRedacted !== false ||
    !context.argumentsHash
  ) {
    throw new Error("Normalized operation metadata did not reach authorization context");
  }

  const ledgerResponse = await json("/api/agent/ledger");
  const ledger = ledgerResponse.data;
  verifyLedger(ledger);

  const verifyResponse = await json("/api/agent/ledger/verify");
  if (!verifyResponse.data.valid) {
    throw new Error("Ledger verify endpoint reported an invalid hash chain");
  }

  const contractEvents = ledger.filter((event: any) => event.sessionId === runSessionId);
  const allowEvent = contractEvents.find((event: any) => event.eventId === packageJson.data.decision.eventId);
  const argumentEvent = contractEvents.find((event: any) => event.eventId === unexpectedArguments.data.decision.eventId);

  if (!allowEvent || allowEvent.tool !== "fs" || allowEvent.normalizedAction !== "read" || allowEvent.resourceType !== "file" || allowEvent.resourceId !== "package.json") {
    throw new Error("Normalized operation identity was not recorded in evidence");
  }

  if (!argumentEvent || !argumentEvent.argumentsPresent || !argumentEvent.argumentsRedacted || !argumentEvent.argumentsHash) {
    throw new Error("Argument metadata/hash was not safely recorded in evidence");
  }

  const ledgerText = JSON.stringify(contractEvents);
  if (ledgerText.includes("react-example") || ledgerText.includes("SECRET") || ledgerText.includes("do-not-leak-secret-value")) {
    throw new Error("Protected content or raw argument secret leaked into evidence");
  }

  console.log("PASS: Normalized tool/action/resource/argument authorization model is enforced and evidenced.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
