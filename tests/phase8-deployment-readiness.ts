import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import net from "net";

const TOKEN = "phase8-deployment-test-token";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert(address && typeof address === "object", "Could not allocate a free port");
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

function serverEnv(port?: number) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    AEGIS_API_TOKEN: TOKEN,
    AWS_ACCESS_KEY_ID: "",
    AWS_SECRET_ACCESS_KEY: "",
    AWS_SESSION_TOKEN: "",
    AWS_PROFILE: "",
    AWS_DEFAULT_PROFILE: "",
    AWS_EC2_METADATA_DISABLED: "true",
    AEGIS_AVP_TIMEOUT_MS: "25",
    AEGIS_AWS_ARCHIVAL_TIMEOUT_MS: "25",
  };
  delete env.BEDROCK_MODEL_ID;
  if (port != null) env.PORT = String(port);
  else delete env.PORT;
  return env;
}

async function startProductionServer(port?: number) {
  const child = spawn("node", ["dist/server.js"], {
    cwd: process.cwd(),
    env: serverEnv(port),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs: string[] = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));

  const actualPort = port || 3000;
  await waitForHealth(actualPort, child, logs);
  return { child, port: actualPort, logs };
}

async function stopServer(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode != null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode == null) child.kill("SIGKILL");
      resolve();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForHealth(port: number, child: ChildProcessWithoutNullStreams, logs: string[]) {
  const deadline = Date.now() + 15000;
  let lastError = "";
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`Server exited before health check. Logs:\n${logs.join("")}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.status === 200) return;
      lastError = `HTTP ${response.status}`;
    } catch (err: any) {
      lastError = String(err?.message || err);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for health on port ${port}: ${lastError}\n${logs.join("")}`);
}

async function jsonRequest(port: number, path: string, init: RequestInit = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const data = await response.json().catch(() => null);
  return { response, data };
}

function authHeaders(extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${TOKEN}`,
    ...extra,
  };
}

function invokeBody(resource: string, trust = "TRUSTED") {
  return {
    sessionId: `sess_phase4_deploy_${Date.now()}`,
    agentId: "DevFix",
    contractId: "tc_devfix_dependency_remediation_v1",
    tool: "fs",
    action: "fs:read",
    resource,
    context: { trust, source: "phase8-deployment-readiness" },
  };
}

async function main() {
  console.log("=== PHASE 8: DEPLOYMENT READINESS TEST ===");

  const defaultServer = await startProductionServer();
  try {
    const health = await jsonRequest(defaultServer.port, "/api/health");
    assert(health.response.status === 200 && health.data?.status === "ok", "Default PORT health check failed");
  } finally {
    await stopServer(defaultServer.child);
  }

  const customPort = await getFreePort();
  const server = await startProductionServer(customPort);
  try {
    const health = await jsonRequest(customPort, "/api/health");
    assert(health.response.status === 200 && health.data?.status === "ok", "Custom PORT health check failed");

    const noToken = await jsonRequest(customPort, "/api/agent/ledger");
    assert(noToken.response.status === 401, "Protected route without token did not return 401");

    const wrongToken = await jsonRequest(customPort, "/api/agent/ledger", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    assert(wrongToken.response.status === 401, "Protected route with wrong token did not return 401");

    const authorizedLedger = await jsonRequest(customPort, "/api/agent/ledger", {
      headers: authHeaders(),
    });
    assert(authorizedLedger.response.status === 200 && Array.isArray(authorizedLedger.data), "Authorized ledger request failed");
    assert(authorizedLedger.data.length === 0, "Fresh production process should start with an empty process-local ledger");

    const allow = await jsonRequest(customPort, "/api/agent/invoke", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(invokeBody("package.json")),
    });
    assert(allow.response.status === 200, "package.json invoke did not return 200");
    assert(allow.data?.decision?.decision === "ALLOW", "package.json was not allowed");
    assert(allow.data?.executionState === "EXECUTED", "package.json did not execute");
    assert(allow.data?.bytesReturned > 0, "package.json returned no bytes");
    assert(allow.data?.eventId, "package.json invoke did not return an eventId");

    const archivalStatus = allow.data?.decision?.archivalStatus;
    assert(archivalStatus, "ALLOW response did not include archival status");
    assert(
      ["failed", "pending", "success"].includes(archivalStatus.eventBridge?.status) &&
        ["failed", "pending", "success"].includes(archivalStatus.dynamoDb?.status) &&
        ["failed", "pending", "success"].includes(archivalStatus.s3?.status),
      "Archival status did not report all sinks"
    );
    assert(
      archivalStatus.eventBridge?.status !== "success" ||
        archivalStatus.dynamoDb?.status !== "success" ||
        archivalStatus.s3?.status !== "success",
      "AWS archival unexpectedly reported full live success in credential-disabled deployment-readiness test"
    );

    const deny = await jsonRequest(customPort, "/api/agent/invoke", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(invokeBody(".env", "UNTRUSTED_EXTERNAL")),
    });
    assert(deny.response.status === 403, ".env invoke did not return 403");
    assert(deny.data?.decision?.decision === "DENY", ".env was not denied");
    assert(deny.data?.executionState === "NOT_EXECUTED", ".env execution state was not NOT_EXECUTED");
    assert(deny.data?.bytesReturned === 0, ".env returned bytes");

    const verified = await jsonRequest(customPort, "/api/agent/ledger/verify", {
      headers: authHeaders(),
    });
    assert(verified.response.status === 200 && verified.data?.valid === true, "Ledger verification failed");

    const ledgerAfterEvents = await jsonRequest(customPort, "/api/agent/ledger", {
      headers: authHeaders(),
    });
    assert(Array.isArray(ledgerAfterEvents.data) && ledgerAfterEvents.data.length >= 4, "Evidence events were not recorded");
  } finally {
    await stopServer(server.child);
  }

  const restarted = await startProductionServer(customPort);
  try {
    const ledgerAfterRestart = await jsonRequest(customPort, "/api/agent/ledger", {
      headers: authHeaders(),
    });
    assert(Array.isArray(ledgerAfterRestart.data), "Ledger after restart did not return an array");
    assert(ledgerAfterRestart.data.length === 0, "Process-local ledger did not reset after restart");
  } finally {
    await stopServer(restarted.child);
  }

  console.log("PASS: Production-style server startup, auth, ALLOW/DENY, AWS degradation, and restart boundary verified.");
}

main().catch((err) => {
  console.error("Phase 8 deployment readiness test failed:", err);
  process.exit(1);
});
