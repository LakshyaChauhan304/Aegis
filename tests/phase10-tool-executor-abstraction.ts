import crypto from "crypto";
import { authorize } from "../server/pep.ts";
import { normalizeToolRequest, ToolRequest } from "../server/task-contracts.ts";
import {
  executorKey,
  getExecutor,
  getExecutorExecutionCounts,
  listExecutors,
  resetExecutorExecutionCounts,
} from "../server/tool-executors.ts";

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
  console.log("=== PHASE 10: TOOL EXECUTOR ABSTRACTION TEST ===");

  const executors = listExecutors();
  if (executors.length !== 1 || executors[0].key !== "fs:fs:read") {
    throw new Error(`Unexpected executor registry: ${JSON.stringify(executors)}`);
  }
  for (const tool of ["npm", "git", "shell", "network", "MCP"]) {
    if (executors.some((executor) => executor.tool === tool)) {
      throw new Error(`${tool} executor should not be registered`);
    }
  }

  const fsReadExecutor = getExecutor("fs", "fs:read");
  if (!fsReadExecutor || executorKey(fsReadExecutor.tool, fsReadExecutor.actionId) !== "fs:fs:read") {
    throw new Error("fs:fs:read executor is not registered");
  }

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
    throw new Error("Axios README fixture read did not execute");
  }

  const env = await invoke({ resource: ".env", context: { trust: "UNTRUSTED_EXTERNAL" } });
  if (env.res.status !== 403 || env.data.executionState !== "NOT_EXECUTED" || env.data.bytesReturned !== 0 || env.data.result) {
    throw new Error(".env was not denied before protected execution");
  }

  expectDenied(await invoke({ tool: "shell", action: "shell:exec", resource: "npm audit --json" }), "unsupported shell");
  expectDenied(await invoke({ tool: "fs", action: "shell:exec", resource: "package.json" }), "unsupported action");
  expectDenied(await invoke({ arguments: ["unexpected"] }), "unexpected arguments");
  expectDenied(await invoke({ resource: "../.env", context: { trust: "UNTRUSTED_EXTERNAL" } }), "traversal variant");

  const missing = await fsReadExecutor.execute(normalizeToolRequest(requestBody({ resource: "definitely-missing-file.txt" })));
  if (missing.statusCode !== 404 || missing.executionState !== "FAILED" || missing.bytesReturned !== 0) {
    throw new Error("fs executor did not preserve file-not-found semantics");
  }

  const traversal = await fsReadExecutor.execute(normalizeToolRequest(requestBody({ resource: "../.env" })));
  if (traversal.statusCode !== 400 || traversal.executionState !== "NOT_EXECUTED" || traversal.bytesReturned !== 0) {
    throw new Error("fs executor did not preserve traversal protection");
  }

  const directoryRead = await fsReadExecutor.execute(normalizeToolRequest(requestBody({ resource: "." })));
  if (directoryRead.statusCode !== 500 || directoryRead.executionState !== "FAILED" || directoryRead.bytesReturned !== 0) {
    throw new Error("fs executor did not preserve execution failure semantics");
  }

  resetExecutorExecutionCounts();
  const deniedDecision = await authorize(requestBody({ resource: ".env", context: { trust: "UNTRUSTED_EXTERNAL" } }));
  if (deniedDecision.decision !== "DENY") {
    throw new Error("Expected direct authorization to deny .env");
  }
  if (Object.keys(getExecutorExecutionCounts()).length !== 0) {
    throw new Error("Executor was invoked during authorization-only DENY path");
  }

  const ledgerResponse = await json("/api/agent/ledger");
  const ledger = ledgerResponse.data;
  verifyLedger(ledger);

  const verifyResponse = await json("/api/agent/ledger/verify");
  if (!verifyResponse.data.valid) {
    throw new Error("Ledger verify endpoint reported an invalid hash chain");
  }

  const contractEvents = ledger.filter((event: any) => event.sessionId === runSessionId);
  const ledgerText = JSON.stringify(contractEvents);
  if (ledgerText.includes("react-example") || ledgerText.includes("SECRET")) {
    throw new Error("Protected file contents leaked into evidence");
  }

  console.log("PASS: Tool executor registry stays narrow and fs:read execution remains authorization-gated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
