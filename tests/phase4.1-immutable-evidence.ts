import { Ledger, EvidenceEvent } from "../server/ledger.ts";

function primaryEvent(sessionId: string, label: string): Omit<EvidenceEvent, "eventId" | "timestamp" | "previousHash" | "hash"> {
  return {
    eventType: "AUTHORIZATION_EXECUTION",
    sessionId,
    agentId: "DevFix",
    contractId: "tc_devfix_dependency_remediation_v1",
    contractVersion: "1",
    contractHash: `contract-${label}`,
    contractValidation: { status: "VALID", valid: true },
    tool: "fs",
    normalizedAction: "read",
    resourceType: "file",
    resourceId: `${label}.json`,
    argumentsHash: "args-hash",
    argumentsPresent: false,
    argumentsRedacted: false,
    action: "fs:read",
    resource: `${label}.json`,
    context: {
      trust: "TRUSTED",
      source: "phase4.1-test",
      sourceHash: "source-hash",
      sourceRedacted: false,
    },
    decision: "ALLOW",
    reason: "test authorization",
    authorization: { provider: "local-cedar" },
    executionState: "EXECUTED",
    httpStatus: 200,
    bytesReturned: 12,
    executorKey: "fs:fs:read",
    execution: {
      state: "EXECUTED",
      statusCode: 200,
      bytesReturned: 12,
      executorKey: "fs:fs:read",
    },
  };
}

function receiptEvent(original: EvidenceEvent): Omit<EvidenceEvent, "eventId" | "timestamp" | "previousHash" | "hash"> {
  return {
    eventType: "ARCHIVAL_RECEIPT",
    sessionId: original.sessionId,
    agentId: original.agentId,
    originalEventId: original.eventId,
    originalEventHash: original.hash,
    archival: {
      status: "ARCHIVAL_FAILED",
      sinks: {
        eventBridge: "failed",
        dynamoDb: "failed",
        s3: "failed",
      },
      failures: {
        eventBridge: "AWS_CREDENTIALS_UNAVAILABLE",
        dynamoDb: "AWS_CREDENTIALS_UNAVAILABLE",
        s3: "AWS_CREDENTIALS_UNAVAILABLE",
      },
    },
  };
}

function main() {
  console.log("=== PHASE 4.1: IMMUTABLE EVIDENCE / ARCHIVAL RECEIPT TEST ===");

  const ledger = new Ledger();
  const a = ledger.appendEvent(primaryEvent("sess_phase41_unit", "a"));
  const aHash = a.hash;
  const b = ledger.appendEvent(primaryEvent("sess_phase41_unit", "b"));
  const bHash = b.hash;
  const bPreviousHash = b.previousHash;

  const aReceipt = ledger.appendEvent(receiptEvent(a));

  if (a.hash !== aHash) throw new Error("Primary event A hash changed after archival receipt");
  if (b.previousHash !== bPreviousHash) throw new Error("Event B previousHash changed after A receipt");
  if (b.hash !== bHash) throw new Error("Event B hash changed after A receipt");
  if (aReceipt.originalEventId !== a.eventId || aReceipt.originalEventHash !== aHash) {
    throw new Error("Archival receipt does not point at the immutable primary event");
  }
  if (aReceipt.previousHash !== bHash) {
    throw new Error("Out-of-order receipt should append at the current chain head");
  }
  if (!ledger.verifyChain()) throw new Error("Ledger failed verification after out-of-order receipt");

  const immediateLedger = new Ledger();
  const primary = immediateLedger.appendEvent(primaryEvent("sess_phase41_immediate", "primary"));
  const receipt = immediateLedger.appendEvent(receiptEvent(primary));
  if (receipt.previousHash !== primary.hash) {
    throw new Error("Immediate receipt should chain directly to the primary event");
  }
  if (receipt.originalEventHash !== primary.hash) {
    throw new Error("Receipt originalEventHash should equal primary hash");
  }
  if (!immediateLedger.verifyChain()) throw new Error("Immediate receipt ledger failed verification");

  const reverseLedger = new Ledger();
  const first = reverseLedger.appendEvent(primaryEvent("sess_phase41_reverse", "first"));
  const second = reverseLedger.appendEvent(primaryEvent("sess_phase41_reverse", "second"));
  const firstHash = first.hash;
  const secondHash = second.hash;
  reverseLedger.appendEvent(receiptEvent(second));
  reverseLedger.appendEvent(receiptEvent(first));
  if (first.hash !== firstHash || second.hash !== secondHash) {
    throw new Error("Out-of-order archival receipts mutated primary events");
  }
  if (!reverseLedger.verifyChain()) throw new Error("Reverse receipt ledger failed verification");

  const receiptCount = reverseLedger.getEvents().filter((event) => event.eventType === "ARCHIVAL_RECEIPT").length;
  if (receiptCount !== 2) {
    throw new Error(`Expected exactly two receipts, got ${receiptCount}`);
  }

  console.log("PASS: Historical events remain immutable and archival receipts append without descendant rehash.");
}

main();
