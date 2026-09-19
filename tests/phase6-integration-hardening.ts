async function testPhase6Hardening() {
  console.log("=== PHASE 6: INTEGRATION HARDENING TEST ===\n");
  const runSessionId = "sess_hardening_" + Date.now();
  async function invoke(tool: string, action: string, resource: string, trust: string) {
    const res = await fetch("http://localhost:3000/api/agent/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: runSessionId,
        agentId: "DevFix",
        contractId: "tc_devfix_dependency_remediation_v1",
        tool,
        resource,
        action,
        context: { trust }
      })
    });
    return { status: res.status, data: await res.json() };
  }

  // 1. One request creates one evidence event.
  // 2. ALLOW -> actual tool execution.
  console.log("TEST: ALLOW -> actual tool execution");
  const allowRes = await invoke("fs", "fs:read", "package.json", "TRUSTED");
  if (allowRes.status !== 200 || allowRes.data.decision.decision !== "ALLOW") {
    throw new Error(`Expected ALLOW and 200, got ${allowRes.status} ${allowRes.data.decision.decision}`);
  }
  if (!allowRes.data.result || !allowRes.data.result.includes("react-example")) {
    throw new Error("Tool execution failed to return actual file contents on ALLOW");
  }
  console.log("✅ Tool execution successful on ALLOW");

  // 3. DENY -> protected tool never executes.
  // 4. DENY still gets recorded.
  console.log("\nTEST: DENY -> protected tool never executes, but gets recorded");
  const denyRes = await invoke("fs", "fs:read", ".env", "UNTRUSTED_EXTERNAL");
  if (denyRes.status !== 403 || denyRes.data.decision.decision !== "DENY") {
    throw new Error(`Expected DENY and 403, got ${denyRes.status} ${denyRes.data.decision.decision}`);
  }
  if (denyRes.data.result) {
    throw new Error("Tool execution leaked contents on DENY!");
  }
  console.log("✅ Tool execution blocked on DENY, 403 returned");

  // Fetch Ledger to verify 1 event per request and hash chain validity
  const ledgerRes = await fetch("http://localhost:3000/api/agent/ledger");
  const ledger = await ledgerRes.json();
  
  const allowEvent = ledger.find((e: any) => e.eventId === allowRes.data.decision.eventId);
  const denyEvent = ledger.find((e: any) => e.eventId === denyRes.data.decision.eventId);
  
  if (!allowEvent || !denyEvent) {
    throw new Error("Events not recorded in the ledger!");
  }
  
  console.log("\nTEST: One request creates one primary evidence event");
  const recentEvents = ledger.filter((e: any) => e.sessionId === runSessionId);
  const primaryEvents = recentEvents.filter((e: any) => e.eventType === "AUTHORIZATION_EXECUTION");
  if (primaryEvents.length !== 2) {
    throw new Error(`Expected exactly 2 primary events created in this test, got ${primaryEvents.length}`);
  }
  console.log("✅ Exactly 1 primary evidence event created per request");

  console.log("\nTEST: Hash chain remains valid across multiple requests");
  const verifyRes = await fetch("http://localhost:3000/api/agent/ledger/verify");
  const verifyData = await verifyRes.json();
  if (!verifyData.valid) {
    throw new Error("Hash chain verification failed!");
  }
  console.log("✅ Hash chain is cryptographically intact");

  console.log("\nTEST: No protected content enters evidence payloads");
  if (JSON.stringify(allowEvent).includes("react-example") || JSON.stringify(denyEvent).includes("SECRET")) {
    throw new Error("Protected content leaked into evidence payloads!");
  }
  console.log("✅ Secret/Content exclusion boundary verified");

  console.log("\nTEST: Test post-hoc Bedrock execution independently");
  const bedrockRes = await fetch(`http://localhost:3000/api/agent/investigate/${denyRes.data.decision.eventId}`);
  const bedrockData = await bedrockRes.json();
  if (bedrockRes.status === 200 && bedrockData.investigationStatus.status === "failed") {
    console.log("✅ Bedrock failed gracefully on post-hoc DENY investigation");
  } else {
    throw new Error("Bedrock post-hoc route did not behave as expected.");
  }
  
  console.log("\n=== PHASE 6 HARDENING TEST COMPLETE ===");
}

testPhase6Hardening().catch(err => {
  console.error("Hardening test failed:", err);
  process.exit(1);
});
