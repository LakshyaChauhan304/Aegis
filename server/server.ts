import express from "express";
import crypto from "crypto";
import path from "path";
import { appendArchivalReceiptEvent, appendEvidenceEvent, evaluateAuthorization, ToolRequest, Decision } from "./pep.js";
import { ArchivalEvidence, globalLedger } from "./ledger.js";
import { createServer as createViteServer } from "vite";
import { archiveToAWS, ArchivalResults } from "./aws-archiver.js";
import { analyzeEvidence } from "./bedrock-investigator.js";
import { getAegisStatus, getCapabilities, getPolicyInfo } from "./status.js";
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

function tokenMatches(expected: string, supplied: string) {
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && crypto.timingSafeEqual(expectedBytes, suppliedBytes);
}

function requireAegisApiAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const configuredToken = process.env.AEGIS_API_TOKEN?.trim();
  const authHeader = req.header("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/);

  if (!configuredToken || !match || !tokenMatches(configuredToken, match[1])) {
    return res.status(401).json({
      error: "Unauthorized",
      reason: "AEGIS_API_AUTH_REQUIRED",
    });
  }

  return next();
}

async function startServer() {
  const app = express();
  const configuredPort = Number(process.env.PORT || 3000);
  const PORT = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : 3000;

  app.use(express.json());

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/aegis/status", (req, res) => {
    res.json(getAegisStatus(globalLedger.getEvents()));
  });

  app.get("/api/aegis/policy", requireAegisApiAccess, (req, res) => {
    res.json(getPolicyInfo());
  });

  app.get("/api/aegis/capabilities", (req, res) => {
    res.json(getCapabilities());
  });

  // Expose Ledger APIs
  app.use("/api/agent", requireAegisApiAccess);

  app.get("/api/agent/ledger", (req, res) => {
    res.json(globalLedger.getEvents());
  });

  app.get("/api/agent/ledger/verify", (req, res) => {
    try {
      const isValid = globalLedger.verifyChain();
      res.json({ valid: isValid });
    } catch (err: any) {
      res.status(400).json({ valid: false, error: err.message });
    }
  });

  app.get("/api/agent/sessions/:sessionId/reconstruct", (req, res) => {
    const sessionId = req.params.sessionId;
    const events = globalLedger.getSessionEvents(sessionId);
    try {
      const valid = globalLedger.verifyChain();
      res.json({
        sessionId,
        events,
        verification: {
          valid,
          scope: "global-ledger",
          eventCount: events.length,
        },
      });
    } catch (err: any) {
      res.status(400).json({
        sessionId,
        events,
        verification: {
          valid: false,
          scope: "global-ledger",
          eventCount: events.length,
          error: err.message,
        },
      });
    }
  });

  // Bedrock Investigation Endpoint
  app.get("/api/agent/investigate/:eventId", async (req, res) => {
    const event = globalLedger.getEvents().find(e => e.eventId === req.params.eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }
    try {
      const investigationStatus = await analyzeEvidence(event.eventId);
      return res.json({ event, investigationStatus });
    } catch {
      return res.status(500).json({ error: "Bedrock failure", errorClassification: "BEDROCK_INVOCATION_FAILED" });
    }
  });

  // Aegis Agent Invoke Endpoint
  app.post("/api/agent/invoke", async (req, res) => {
    const request: ToolRequest = req.body;
    const missingFields = ["sessionId", "agentId", "contractId", "tool", "action", "resource"]
      .filter((field) => typeof (request as any)?.[field] !== "string" || !(request as any)[field].trim());

    if (!request?.context || typeof request.context.trust !== "string" || !request.context.trust.trim()) {
      missingFields.push("context.trust");
    }

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: "Malformed request",
        reason: "Missing required authorization fields",
        missingFields,
        executionState: "NOT_EXECUTED",
        bytesReturned: 0,
      });
    }

    const normalizedRequest = normalizeToolRequest(request);

    // 1. Evaluate authorization. Evidence is appended after execution outcome is known.
    const evaluation = await evaluateAuthorization(normalizedRequest);
    
    // 2. Enforce decision and Execute real tool operation ONLY IF ALLOWED
    let executionResult: ExecutionResult;
    let executedBy: string | undefined = undefined;
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

    // 3. Record hash-covered evidence of both authorization and execution.
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

    // 4. Dispatch out-of-band telemetry (AWS) for the immutable primary event.
    // The result is recorded as a separate receipt event to avoid mutating history.
    let archivalStatus: ArchivalResults | undefined = undefined;
    if (event) {
      archivalStatus = await archiveToAWS(event).catch(err => ({
        eventBridge: { status: "failed" as const, error: "AWS_ARCHIVAL_UNAVAILABLE" },
        dynamoDb: { status: "failed" as const, error: "AWS_ARCHIVAL_UNAVAILABLE" },
        s3: { status: "failed" as const, error: "AWS_ARCHIVAL_UNAVAILABLE" },
      }));
      appendArchivalReceiptEvent(event, archivalEvidenceFromResults(archivalStatus));
    }

    // Return final integrated response payload
    return res.status(executionResult.statusCode).json({
      decision: { ...decision, authorization: event?.authorization, archivalStatus },
      eventId: decision.eventId,
      httpStatus: executionResult.statusCode,
      executionState: executionResult.executionState,
      bytesReturned: executionResult.bytesReturned,
      ...(executionResult.error ? { error: executionResult.error } : {}),
      ...(executionResult.result !== undefined ? { result: executionResult.result } : {}),
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Aegis Gateway running on http://0.0.0.0:${PORT}`);
  });

  function shutdown(signal: NodeJS.Signals) {
    console.log(`[AEGIS] ${signal} received; closing HTTP server.`);
    server.close(() => {
      console.log("[AEGIS] HTTP server closed.");
      process.exit(0);
    });
  }

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

startServer();
