async function testPhase5() {
  console.log("=== PHASE 5: POST-HOC BEDROCK INVESTIGATION TEST ===");

  async function invoke(tool: string, action: string, resource: string, trust: string) {
    const res = await fetch("http://localhost:3000/api/agent/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess_bedrock_test_" + Date.now(),
        agentId: "DevFix",
        contractId: "tc_devfix_dependency_remediation_v1",
        tool,
        resource,
        action,
        context: { trust }
      })
    });
    return res.json();
  }

  console.log("\n1. Generating an UNAUTHORIZED event (.env) to test Bedrock boundary...");
  const resB = await invoke("fs", "fs:read", ".env", "UNTRUSTED_EXTERNAL");
  
  console.log("\n2. Analyzing Authorization Decision...");
  console.log(`Original Decision: ${resB.decision?.decision}`);
  if (resB.decision?.decision !== "DENY") {
    throw new Error(`❌ Boundary violation: Expected DENY but got ${resB.decision?.decision}`);
  }
  console.log("✅ Authorization remained DENY.");

  console.log("\n3. Verifying Bedrock is not in the runtime response path...");
  if (resB.decision?.investigationStatus) {
    throw new Error("Runtime invoke response unexpectedly included investigationStatus");
  }
  console.log("✅ Runtime DENY response did not require Bedrock investigation.");

  console.log("\n4. Invoking Bedrock through the explicit post-hoc investigation endpoint...");
  const investigationRes = await fetch(`http://localhost:3000/api/agent/investigate/${resB.decision.eventId}`);
  const investigationData = await investigationRes.json();
  const investigationStatus = investigationData.investigationStatus;
  console.log(JSON.stringify(investigationStatus, null, 2));
  if (investigationStatus?.status === "success") {
    console.log("✅ Bedrock post-hoc investigation succeeded.");
  } else if (investigationStatus?.status === "failed") {
    console.log("✅ Bedrock post-hoc graceful degradation verified.");
    console.log(`Error Reason: ${investigationStatus.error}`);
  } else {
    throw new Error("Missing post-hoc investigation status");
  }

  console.log("\n5. Verifying Evidence Envelope recorded correctly...");
  const ledgerRes = await fetch("http://localhost:3000/api/agent/ledger");
  const ledger = await ledgerRes.json();
  
  const latestEvent = ledger.find((e: any) => e.eventId === resB.decision?.eventId);
  if (!latestEvent) {
    throw new Error("Could not find the generated event in the ledger");
  }
  
  console.log(`✅ Evidence Event securely hashed and preserved:\n${JSON.stringify({
      eventId: latestEvent.eventId,
      action: latestEvent.action,
      resource: latestEvent.resource,
      decision: latestEvent.decision,
      hash: latestEvent.hash
  }, null, 2)}`);

  console.log("\n=== PHASE 5 TEST COMPLETE ===");
}

testPhase5().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
