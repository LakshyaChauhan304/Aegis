import { EvidenceEvent, Ledger } from "../server/ledger.ts";

type EventInput = Omit<EvidenceEvent, "eventId" | "timestamp" | "previousHash" | "hash">;

function primaryEvent(sessionId: string, label: string): EventInput {
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
    argumentsHash: `args-${label}`,
    argumentsPresent: false,
    argumentsRedacted: true,
    action: "fs:read",
    resource: `${label}.json`,
    context: {
      trust: "TRUSTED",
      source: "phase7-test",
      sourceHash: `source-${label}`,
      sourceRedacted: false,
      provenance: {
        labels: ["INTERNAL_VERIFIED", label],
      },
    },
    decision: "ALLOW",
    reason: "phase7 test authorization",
    authorization: { provider: "local-cedar" },
    executionState: "EXECUTED",
    httpStatus: 200,
    bytesReturned: 64,
    executorKey: "fs:fs:read",
    execution: {
      state: "EXECUTED",
      statusCode: 200,
      bytesReturned: 64,
      executorKey: "fs:fs:read",
      reason: "phase7 execution proof",
    },
  };
}

function receiptEvent(original: EvidenceEvent): EventInput {
  return {
    eventType: "ARCHIVAL_RECEIPT",
    sessionId: original.sessionId,
    agentId: original.agentId,
    originalEventId: original.eventId,
    originalEventHash: original.hash,
    archival: {
      status: "ARCHIVAL_PARTIAL",
      sinks: {
        eventBridge: "success",
        dynamoDb: "failed",
        s3: "success",
      },
      eventBridgeEventId: "eventbridge-phase7-id",
      failures: {
        dynamoDb: "AWS_ARCHIVAL_UNAVAILABLE",
      },
    },
  };
}

function attemptMutation(fn: () => void) {
  try {
    fn();
  } catch {
    // Frozen objects may throw in strict mode. The test proves stored state by re-reading.
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertValid(ledger: Ledger, label: string) {
  assert(ledger.verifyChain(), `${label}: ledger verification failed`);
}

function main() {
  console.log("=== PHASE 7: LEDGER IMMUTABILITY HARDENING TEST ===");

  const ledger = new Ledger();

  const appended = ledger.appendEvent(primaryEvent("sess_phase7_immutability", "append"));
  const appendedId = appended.eventId;
  const appendedHash = appended.hash;
  const appendedDecision = appended.decision;
  const appendedExecutionBytes = appended.execution?.bytesReturned;

  attemptMutation(() => {
    (appended as any).decision = "DENY";
    (appended as any).hash = "mutated-hash";
    (appended.execution as any).bytesReturned = 9999;
    (appended.context as any).provenance.labels.push("MUTATED");
  });

  const rereadAppend = ledger.getEvent(appendedId);
  assert(rereadAppend, "appendEvent isolation: stored event missing");
  assert(rereadAppend.hash === appendedHash, "appendEvent isolation: stored hash changed");
  assert(rereadAppend.decision === appendedDecision, "appendEvent isolation: stored decision changed");
  assert(rereadAppend.execution?.bytesReturned === appendedExecutionBytes, "appendEvent isolation: nested execution changed");
  assert(!(rereadAppend.context as any).provenance.labels.includes("MUTATED"), "appendEvent isolation: nested provenance changed");
  assertValid(ledger, "appendEvent isolation");

  const second = ledger.appendEvent(primaryEvent("sess_phase7_immutability", "second"));
  const third = ledger.appendEvent(primaryEvent("sess_phase7_other", "third"));
  const originalOrder = ledger.getEvents().map((event) => event.eventId);
  const originalCount = originalOrder.length;

  const eventsForArrayMutation = ledger.getEvents();
  const fakeEvent = { ...eventsForArrayMutation[0], eventId: "evt_fake_phase7" };
  attemptMutation(() => {
    eventsForArrayMutation.push(fakeEvent);
    eventsForArrayMutation.splice(0, 1);
  });

  const afterArrayMutation = ledger.getEvents();
  assert(afterArrayMutation.length === originalCount, "getEvents array isolation: internal count changed");
  assert(afterArrayMutation.map((event) => event.eventId).join("|") === originalOrder.join("|"), "getEvents array isolation: internal order changed");

  const eventsForObjectMutation = ledger.getEvents();
  const objectMutationTarget = eventsForObjectMutation[0];
  attemptMutation(() => {
    (objectMutationTarget as any).resourceId = "mutated-resource";
    (objectMutationTarget.execution as any).state = "FAILED";
    (objectMutationTarget.context as any).provenance.labels[0] = "MUTATED";
  });

  const afterObjectMutation = ledger.getEvent(objectMutationTarget.eventId);
  assert(afterObjectMutation?.resourceId !== "mutated-resource", "getEvents object isolation: resourceId changed");
  assert(afterObjectMutation?.execution?.state === "EXECUTED", "getEvents object isolation: nested execution changed");
  assert((afterObjectMutation?.context as any).provenance.labels[0] === "INTERNAL_VERIFIED", "getEvents object isolation: nested context changed");

  const receipt = ledger.appendEvent(receiptEvent(second));
  const receiptHash = receipt.hash;
  const receiptStatus = receipt.archival?.status;
  const receiptFailure = receipt.archival?.failures?.dynamoDb;

  const eventsWithReceipt = ledger.getEvents();
  const receiptCopy = eventsWithReceipt.find((event) => event.eventId === receipt.eventId);
  assert(receiptCopy, "getEvents object isolation: receipt missing");
  attemptMutation(() => {
    (receiptCopy.archival as any).status = "ARCHIVAL_SUCCESS";
    (receiptCopy.archival as any).sinks.dynamoDb = "success";
    (receiptCopy.archival as any).failures.dynamoDb = "MUTATED_FAILURE";
  });

  const rereadReceipt = ledger.getEvent(receipt.eventId);
  assert(rereadReceipt?.hash === receiptHash, "archival nested isolation: receipt hash changed");
  assert(rereadReceipt?.archival?.status === receiptStatus, "archival nested isolation: status changed");
  assert(rereadReceipt?.archival?.sinks.dynamoDb === "failed", "archival nested isolation: sink changed");
  assert(rereadReceipt?.archival?.failures?.dynamoDb === receiptFailure, "archival nested isolation: failure changed");

  const getEventCopy = ledger.getEvent(second.eventId);
  assert(getEventCopy, "getEvent isolation: event missing");
  const secondHash = second.hash;
  const thirdHash = third.hash;
  const thirdPreviousHash = third.previousHash;
  attemptMutation(() => {
    (getEventCopy as any).hash = "mutated-hash";
    (getEventCopy as any).decision = "DENY";
    (getEventCopy.execution as any).statusCode = 500;
    (getEventCopy.contractValidation as any).valid = false;
  });

  const rereadSecond = ledger.getEvent(second.eventId);
  assert(rereadSecond?.hash === secondHash, "getEvent isolation: hash changed");
  assert(rereadSecond?.decision === "ALLOW", "getEvent isolation: decision changed");
  assert(rereadSecond?.execution?.statusCode === 200, "getEvent isolation: nested execution changed");
  assert(rereadSecond?.contractValidation?.valid === true, "getEvent isolation: nested contract validation changed");

  const sessionEvents = ledger.getSessionEvents("sess_phase7_immutability");
  const sessionCount = sessionEvents.length;
  const sessionFirstId = sessionEvents[0].eventId;
  attemptMutation(() => {
    (sessionEvents[0] as any).agentId = "MutatedAgent";
    (sessionEvents[0].execution as any).bytesReturned = 0;
    sessionEvents.pop();
  });

  const rereadSessionEvents = ledger.getSessionEvents("sess_phase7_immutability");
  assert(rereadSessionEvents.length === sessionCount, "getSessionEvents isolation: session count changed");
  assert(rereadSessionEvents[0].eventId === sessionFirstId, "getSessionEvents isolation: session order changed");
  assert(rereadSessionEvents[0].agentId === "DevFix", "getSessionEvents isolation: agent changed");
  assert(rereadSessionEvents[0].execution?.bytesReturned === 64, "getSessionEvents isolation: nested execution changed");

  assert(receipt.originalEventHash === secondHash, "archival receipt integrity: originalEventHash mismatch");
  assert(ledger.getEvent(second.eventId)?.hash === secondHash, "archival receipt integrity: primary hash changed");
  assert(ledger.getEvent(third.eventId)?.hash === thirdHash, "descendant integrity: descendant hash changed");
  assert(ledger.getEvent(third.eventId)?.previousHash === thirdPreviousHash, "descendant integrity: descendant previousHash changed");

  assertValid(ledger, "final mutation coverage");

  console.log("PASS: Ledger stores frozen events and returns defensive copies without rewriting history.");
}

main();
