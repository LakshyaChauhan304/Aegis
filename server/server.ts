import express from "express";
import path from "path";
import { authorize, ToolRequest, Decision } from "./pep.js";
import { globalLedger } from "./ledger.js";
import { createServer as createViteServer } from "vite";
import { archiveToAWS, ArchivalResults } from "./aws-archiver.js";
import { analyzeEvidence } from "./bedrock-investigator.js";
import { getAegisStatus, getCapabilities, getPolicyInfo } from "./status.js";
import { normalizeToolRequest } from "./task-contracts.js";
import { getExecutor, ExecutionResult } from "./tool-executors.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/aegis/status", (req, res) => {
    res.json(getAegisStatus(globalLedger.getEvents()));
  });

  app.get("/api/aegis/policy", (req, res) => {
    res.json(getPolicyInfo());
  });

  app.get("/api/aegis/capabilities", (req, res) => {
    res.json(getCapabilities());
  });

  // Expose Ledger APIs
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

  // Bedrock Investigation Endpoint
  app.get("/api/agent/investigate/:eventId", async (req, res) => {
    const event = globalLedger.getEvents().find(e => e.eventId === req.params.eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }
    try {
      const investigationStatus = await analyzeEvidence(event);
      return res.json({ event, investigationStatus });
    } catch (err: any) {
      return res.status(500).json({ error: "Bedrock failure", details: err.message });
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

    // 1. Evaluate authorization (Decision is FIXED and ledger is appended inside)
    const decision: Decision = await authorize(normalizedRequest);
    
    // 2. Enforce decision and Execute real tool operation ONLY IF ALLOWED
    let executionResult: ExecutionResult;
    if (decision.decision === "DENY") {
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
        executionResult = await executor.execute(normalizedRequest);
      }
    }

    // 3. Dispatch out-of-band telemetry (AWS) AFTER execution
    const event = globalLedger.getEvents().find(e => e.eventId === decision.eventId);
    let archivalStatus: ArchivalResults | undefined = undefined;
    if (event) {
      archivalStatus = await archiveToAWS(event).catch(err => ({
        eventBridge: { status: "failed" as const, error: err.message },
        dynamoDb: { status: "failed" as const, error: err.message },
        s3: { status: "failed" as const, error: err.message },
      }));
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Aegis Gateway running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
