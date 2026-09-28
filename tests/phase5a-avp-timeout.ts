import http from "http";

async function main() {
  process.env.AWS_ACCESS_KEY_ID = "aegis-timeout-test";
  process.env.AWS_SECRET_ACCESS_KEY = "aegis-timeout-test";
  process.env.AWS_SESSION_TOKEN = "";
  process.env.AWS_PROFILE = "";
  process.env.AWS_DEFAULT_PROFILE = "";
  process.env.AWS_EC2_METADATA_DISABLED = "true";
  process.env.AEGIS_AVP_TIMEOUT_MS = "25";
  process.env.AEGIS_AWS_ARCHIVAL_TIMEOUT_MS = "25";

  const server = http.createServer((_req, _res) => {
    // Intentionally leave the connection open so AbortSignal timeout is exercised.
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not start local timeout test endpoint");
  }

  const endpoint = `http://127.0.0.1:${address.port}`;
  process.env.AWS_ENDPOINT_URL = endpoint;
  process.env.AWS_ENDPOINT_URL_VERIFIEDPERMISSIONS = endpoint;

  try {
    const { authorize } = await import("../server/pep.ts");
    const { globalLedger } = await import("../server/ledger.ts");
    const started = Date.now();
    const decision = await authorize({
      sessionId: "timeout-test",
      agentId: "DevFix",
      contractId: "tc_devfix_dependency_remediation_v1",
      tool: "fs",
      resource: "package.json",
      action: "fs:read",
      context: { trust: "TRUSTED" },
    });
    const elapsed = Date.now() - started;
    const event = globalLedger.getEvents().find((e) => e.eventId === decision.eventId);

    if (elapsed > 2000) {
      throw new Error(`AVP timeout fallback took too long: ${elapsed}ms`);
    }
    if (decision.decision !== "ALLOW") {
      throw new Error(`Expected local Cedar fallback ALLOW, got ${decision.decision}`);
    }
    if (event?.authorization.provider !== "local-cedar") {
      throw new Error(`Expected local-cedar fallback provider, got ${event?.authorization.provider}`);
    }
    if (!event.authorization.error?.includes("timed out")) {
      throw new Error(`Expected timeout error in evidence, got ${event.authorization.error || "none"}`);
    }

    console.log("PASS: AVP timeout is bounded and falls back to existing local Cedar path.");
    console.log(`Elapsed: ${elapsed}ms`);
    console.log(`Event: ${decision.eventId}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
