import express from "express";
import crypto from "crypto";
import path from "path";
import { globalLedger } from "./ledger.js";
import { createServer as createViteServer } from "vite";
import { analyzeEvidence } from "./bedrock-investigator.js";
import { getAegisStatus, getCapabilities, getPolicyInfo } from "./status.js";
import { executeAgentTool } from "./agent-invoke.js";
import { runDevFix } from "./devfix-runner.js";
import { ToolRequest, DEVFIX_CONTRACT_ID } from "./task-contracts.js";

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

    const response = await executeAgentTool(request);
    return res.status(response.httpStatus).json(response);
  });

  app.use("/api/devfix", requireAegisApiAccess);

  app.post("/api/devfix/run", async (req, res) => {
    if (req.body?.contractId !== DEVFIX_CONTRACT_ID) {
      return res.status(400).json({
        error: "Unsupported contract",
        reason: "contractId must be the DevFix reference contract",
      });
    }
    const result = await runDevFix({ contractId: req.body.contractId });
    return res.status(200).json(result);
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
