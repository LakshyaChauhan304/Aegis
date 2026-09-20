import { appendArchivalReceiptEvent, appendEvidenceEvent, evaluateAuthorization, Decision, ToolRequest } from "./pep.js";
import { ArchivalEvidence } from "./ledger.js";
import { archiveToAWS, ArchivalResults } from "./aws-archiver.js";
import { normalizeToolRequest } from "./task-contracts.js";
import { executorKey, getExecutor, ExecutionResult } from "./tool-executors.js";

function archivalEvidenceFromResults(results: ArchivalResults): ArchivalEvidence {
  const statuses = [results.eventBridge.status, results.dynamoDb.status, results.s3.status];
  const successCount = statuses.filter((status) => status === "success").length;
  const status = successCount === 3
    ? "ARCHIVAL_SUCCESS"
    : successCount === 0
      ? "ARCHIVAL_FAILED"
      : "ARCHIVAL_PARTIAL";

  return {
    status,
    sinks: {
      eventBridge: results.eventBridge.status,
      dynamoDb: results.dynamoDb.status,
      s3: results.s3.status,
    },
    eventBridgeEventId: results.eventBridge.eventId,
    failures: {
      ...(results.eventBridge.error ? { eventBridge: results.eventBridge.error } : {}),
      ...(results.dynamoDb.error ? { dynamoDb: results.dynamoDb.error } : {}),
      ...(results.s3.error ? { s3: results.s3.error } : {}),
    },
  };
}

function safeExecutionReason(result: ExecutionResult, fallback: string) {
  if (result.executionState === "EXECUTED") return undefined;
  if (result.error === "Unsupported arguments") return "UNSUPPORTED_ARGUMENTS";
  if (result.error === "Path traversal not allowed") return "PATH_TRAVERSAL_NOT_ALLOWED";
  if (result.error === "File not found") return "FILE_NOT_FOUND";
  if (result.error === "Unsupported tool/action") return "UNSUPPORTED_TOOL_ACTION";
  if (result.error === "Forbidden") return "AUTHORIZATION_DENIED";
  if (result.error === "Execution failed") return "EXECUTION_FAILED";
  return fallback;
}

export type AgentInvokeResponse = {
  decision: Decision & { authorization?: unknown; archivalStatus?: ArchivalResults };
  eventId: string;
  httpStatus: number;
  executionState: ExecutionResult["executionState"];
  bytesReturned: number;
  error?: string;
  result?: unknown;
};

export async function executeAgentTool(request: ToolRequest): Promise<AgentInvokeResponse> {
  const normalizedRequest = normalizeToolRequest(request);
  const evaluation = await evaluateAuthorization(normalizedRequest);

  let executionResult: ExecutionResult;
  let executedBy: string | undefined;
  if (evaluation.decision === "DENY") {
    console.log(`[AEGIS PEP] DENIED: ${normalizedRequest.operation.actionId} on ${normalizedRequest.operation.resource.id}`);
    executionResult = {
      statusCode: 403,
      error: "Forbidden",
      executionState: "NOT_EXECUTED",
      bytesReturned: 0,
    };
  } else {
    console.log(`[AEGIS PEP] ALLOWED: ${normalizedRequest.operation.actionId} on ${normalizedRequest.operation.resource.id}`);
    const executor = getExecutor(normalizedRequest.operation.tool, normalizedRequest.operation.actionId);
    if (!executor) {
      executionResult = {
        statusCode: 400,
        error: "Unsupported tool/action",
        executionState: "NOT_EXECUTED",
        bytesReturned: 0,
      };
    } else {
      executedBy = executorKey(executor.tool, executor.actionId);
      executionResult = await executor.execute(normalizedRequest);
    }
  }

  const event = appendEvidenceEvent(evaluation, {
    state: executionResult.executionState,
    statusCode: executionResult.statusCode,
    bytesReturned: executionResult.bytesReturned,
    executorKey: executedBy,
    reason: safeExecutionReason(executionResult, "NOT_EXECUTED"),
  });

  const decision: Decision = {
    decision: evaluation.decision,
    reason: evaluation.reason,
    eventId: event.eventId,
    hash: event.hash,
    contractValidation: evaluation.contractValidation,
  };

  const archivalStatus = await archiveToAWS(event).catch(() => ({
    eventBridge: { status: "failed" as const, error: "AWS_ARCHIVAL_UNAVAILABLE" },
    dynamoDb: { status: "failed" as const, error: "AWS_ARCHIVAL_UNAVAILABLE" },
    s3: { status: "failed" as const, error: "AWS_ARCHIVAL_UNAVAILABLE" },
  }));
  appendArchivalReceiptEvent(event, archivalEvidenceFromResults(archivalStatus));

  return {
    decision: { ...decision, authorization: event.authorization, archivalStatus },
    eventId: decision.eventId,
    httpStatus: executionResult.statusCode,
    executionState: executionResult.executionState,
    bytesReturned: executionResult.bytesReturned,
    ...(executionResult.error ? { error: executionResult.error } : {}),
    ...(executionResult.result !== undefined ? { result: executionResult.result } : {}),
  };
}
