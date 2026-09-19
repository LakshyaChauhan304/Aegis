async function testPhase3() {
  console.log("=== PHASE 3: AMAZON VERIFIED PERMISSIONS AUTHORIZATION TEST ===");

  async function invoke(tool: string, action: string, resource: string, trust: string) {
    const res = await fetch("http://localhost:3000/api/agent/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess_test_" + Date.now(),
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

  console.log("\n1. Requesting authorized resource (package.json) ...");
  const resA = await invoke("fs", "fs:read", "package.json", "TRUSTED");
  console.log(`- Request A Decision: ${resA.decision?.decision || resA.decision}`);
  console.log(`- EventId: ${resA.decision?.eventId || resA.eventId}`);

  console.log("\n2. Requesting forbidden resource (.env) ...");
  const resB = await invoke("fs", "fs:read", ".env", "UNTRUSTED_EXTERNAL");
  console.log(`- Request B Decision: ${resB.decision?.decision || resB.decision || resB.error}`);
  console.log(`- EventId: ${resB.decision?.eventId || resB.eventId}`);

  console.log("\n3. Inspecting the Evidence Ledger to verify Authorization Provider ...");
  const ledgerRes = await fetch("http://localhost:3000/api/agent/ledger");
  const ledger = await ledgerRes.json();
  
  const lastTwo = ledger.slice(-2);
  lastTwo.forEach((ev: any, idx: number) => {
    console.log(`\nEvent ${idx + 1}: ${ev.resource}`);
    console.log(`- Decision: ${ev.decision}`);
    console.log(`- Provider: ${ev.authorization?.provider}`);
    console.log(`- AVP Error/Fallback: ${ev.authorization?.error || "None"}`);
  });

  console.log("\n=== PHASE 3 TEST COMPLETE ===");
}

testPhase3().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
