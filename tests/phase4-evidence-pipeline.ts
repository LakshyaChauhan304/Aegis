import crypto from "crypto";
import { authFetch, authHeaders } from "./test-auth.ts";

const CONTRACT_ID = "tc_devfix_dependency_remediation_v1";
const runSessionId = "sess_phase4_" + Date.now();
const secretMarker = "PHASE4_SUPER_SECRET_SOURCE_MARKER";

async function json(apiPath: string, init?: RequestInit) {
  const res = await authFetch(apiPath, init);
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
    context: { trust: "TRUSTED", source: "phase4-test" },
    ...overrides,
  };
}

async function invoke(overrides: Record<string, any> = {}) {
  return json("/api/agent/invoke", {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
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

function expectTamperFailure(ledger: any[], eventId: string, mutate: (event: any) => void, label: string) {
  const copy = JSON.parse(JSON.stringify(ledger));
  const event = copy.find((candidate: any) => candidate.eventId === eventId);
  if (!event) throw new Error(`Missing event for tamper test: ${label}`);
  mutate(event);
  try {
    verifyLedger(copy);
  } catch {
    return;
  }
  throw new Error(`Tamper test unexpectedly passed for ${label}`);
}

async function main() {
  console.log("=== PHASE 4: COMPLETE EVIDENCE PIPELINE TEST ===");

  const deny = await invoke({
    resource: ".env",
    context: { trust: "UNTRUSTED_EXTERNAL", source: "node_modules/axios/README.md" },
  });
  if (deny.res.status !== 403 || deny.data.decision?.decision !== "DENY" || deny.data.executionState !== "NOT_EXECUTED" || deny.data.bytesReturned !== 0 || deny.data.result) {
    throw new Error(".env denial was not evidenced as DENY/NOT_EXECUTED/0 bytes");
  }

  const allow = await invoke();
  if (allow.res.status !== 200 || allow.data.decision?.decision !== "ALLOW" || allow.data.executionState !== "EXECUTED") {
    throw new Error("package.json was not evidenced as ALLOW/EXECUTED");
  }
  const expectedBytes = Buffer.byteLength(allow.data.result, "utf8");
  if (allow.data.bytesReturned !== expectedBytes || expectedBytes <= 0) {
    throw new Error(`package.json byte evidence mismatch: got ${allow.data.bytesReturned}, expected ${expectedBytes}`);
  }

  const failed = await invoke({ resource: "tests/fixtures/missing-allowed.txt" });
  if (failed.res.status !== 404 || failed.data.decision?.decision !== "ALLOW" || failed.data.executionState !== "FAILED" || failed.data.bytesReturned !== 0) {
    throw new Error("controlled missing file was not evidenced as ALLOW/FAILED/0 bytes");
  }

  const sourceBoundary = await invoke({
    context: {
      trust: "TRUSTED",
      source: `operator-note:${secretMarker}:do-not-persist-raw`,
    },
  });
  if (sourceBoundary.res.status !== 200) {
    throw new Error("source-boundary request should remain authorized");
  }

  const ledgerResponse = await json("/api/agent/ledger");
  const ledger = ledgerResponse.data;
  verifyLedger(ledger);

  const denyEvent = ledger.find((event: any) => event.eventId === deny.data.eventId);
  const allowEvent = ledger.find((event: any) => event.eventId === allow.data.eventId);
  const failedEvent = ledger.find((event: any) => event.eventId === failed.data.eventId);
  const sourceEvent = ledger.find((event: any) => event.eventId === sourceBoundary.data.eventId);
  const receiptForDeny = ledger.find((event: any) => event.eventType === "ARCHIVAL_RECEIPT" && event.originalEventId === deny.data.eventId);
  const receiptForAllow = ledger.find((event: any) => event.eventType === "ARCHIVAL_RECEIPT" && event.originalEventId === allow.data.eventId);
  const receiptForFailed = ledger.find((event: any) => event.eventType === "ARCHIVAL_RECEIPT" && event.originalEventId === failed.data.eventId);

  if (!denyEvent || denyEvent.decision !== "DENY" || denyEvent.executionState !== "NOT_EXECUTED" || denyEvent.bytesReturned !== 0 || denyEvent.executorKey) {
    throw new Error("DENY event missing hash-covered non-execution evidence");
  }
  if (!allowEvent || allowEvent.decision !== "ALLOW" || allowEvent.executionState !== "EXECUTED" || allowEvent.executorKey !== "fs:fs:read" || allowEvent.bytesReturned !== expectedBytes) {
    throw new Error("ALLOW event missing hash-covered execution evidence");
  }
  if (!failedEvent || failedEvent.decision !== "ALLOW" || failedEvent.executionState !== "FAILED" || failedEvent.execution?.reason !== "FILE_NOT_FOUND") {
    throw new Error("Execution failure event missing safe failure evidence");
  }

  const sessionEvents = ledger.filter((event: any) => event.sessionId === runSessionId);
  const serializedSessionEvents = JSON.stringify(sessionEvents);
  if (serializedSessionEvents.includes(secretMarker) || serializedSessionEvents.includes("react-example")) {
    throw new Error("Evidence leaked raw source secret marker or file contents");
  }
  if (!sourceEvent?.context?.sourceHash || sourceEvent.context.sourceRedacted !== true || !String(sourceEvent.context.source).startsWith("redacted-source:")) {
    throw new Error("Source boundary did not preserve safe provenance hash/redaction metadata");
  }

  for (const [event, receipt] of [[denyEvent, receiptForDeny], [allowEvent, receiptForAllow], [failedEvent, receiptForFailed]]) {
    if (event.archival) {
      throw new Error(`Primary event unexpectedly contains archival outcome ${event.eventId}`);
    }
    if (!receipt || receipt.originalEventHash !== event.hash || receipt.originalEventId !== event.eventId) {
      throw new Error(`Archival receipt missing or incorrectly linked for ${event.eventId}`);
    }
    if (!receipt.archival || !["ARCHIVAL_SUCCESS", "ARCHIVAL_PARTIAL", "ARCHIVAL_FAILED"].includes(receipt.archival.status)) {
      throw new Error(`Archival outcome missing from receipt for ${event.eventId}`);
    }
  }

  expectTamperFailure(ledger, allowEvent.eventId, (event) => { event.executionState = "NOT_EXECUTED"; }, "executionState");
  expectTamperFailure(ledger, allowEvent.eventId, (event) => { event.bytesReturned = 1; }, "bytesReturned");
  expectTamperFailure(ledger, allowEvent.eventId, (event) => { event.httpStatus = 418; }, "httpStatus");
  expectTamperFailure(ledger, allowEvent.eventId, (event) => { event.executorKey = "fs:other"; }, "executorKey");
  expectTamperFailure(ledger, receiptForAllow.eventId, (event) => { event.archival.status = "TAMPERED"; }, "archival.status");

  const reconstruction = await json(`/api/agent/sessions/${encodeURIComponent(runSessionId)}/reconstruct`);
  if (reconstruction.res.status !== 200 || reconstruction.data.sessionId !== runSessionId || reconstruction.data.verification?.valid !== true) {
    throw new Error("Session reconstruction did not return verified session evidence");
  }
  if (reconstruction.data.events.length !== sessionEvents.length) {
    throw new Error("Session reconstruction event count mismatch");
  }
  for (const event of reconstruction.data.events) {
    if (event.sessionId !== runSessionId) {
      throw new Error("Session reconstruction leaked an event from another session");
    }
  }

  console.log("PASS: Phase 4 evidence pipeline records authorization, execution, archival status, reconstruction, and source redaction.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
