import crypto from 'crypto';

async function testPhase2() {
  console.log("=== PHASE 2: EVIDENCE LEDGER & SHA-256 LINEAR HASH CHAIN TEST ===");

  // Helper to call the invoke API
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

  console.log("\n1. Making requests to generate evidence events...");
  
  // A. Valid Request
  const resA = await invoke("fs", "fs:read", "package.json", "TRUSTED");
  console.log(`- Request A (package.json): ${resA.decision?.decision}, EventId: ${resA.decision?.eventId}`);

  // B. Invalid Request (DENY)
  const resB = await invoke("fs", "fs:read", ".env", "UNTRUSTED_EXTERNAL");
  console.log(`- Request B (.env): ${resB.decision?.decision || resB.error}, EventId: ${resB.decision?.eventId}`);

  // C. Another Valid Request
  const resC = await invoke("fs", "fs:read", "README.md", "TRUSTED");
  console.log(`- Request C (README.md): ${resC.decision?.decision}, EventId: ${resC.decision?.eventId}`);

  console.log("\n2. Fetching Ledger...");
  const ledgerRes = await fetch("http://localhost:3000/api/agent/ledger");
  const ledger = await ledgerRes.json();
  console.log(`- Retrieved ${ledger.length} events from the ledger.`);

  console.log("\n3. Testing Canonicalization and Verification locally...");
  
  function sortKeysRecursive(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(sortKeysRecursive);
    }
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, any> = {};
    for (const key of sortedKeys) {
      result[key] = sortKeysRecursive(obj[key]);
    }
    return result;
  }

  function canonicalize(event: any) {
    const { hash, ...unhashed } = event;
    return JSON.stringify(sortKeysRecursive(unhashed));
  }

  function verifyLedger(chain: any[]) {
    let prevHash = "GENESIS";
    for (let i = 0; i < chain.length; i++) {
      const ev = chain[i];
      if (ev.previousHash !== prevHash) {
        throw new Error(`Chain broken at index ${i}: Expected prevHash ${prevHash}, got ${ev.previousHash}`);
      }
      const computed = crypto.createHash('sha256').update(canonicalize(ev)).digest('hex');
      if (computed !== ev.hash) {
        throw new Error(`Hash mismatch at index ${i}: Expected ${ev.hash}, computed ${computed}`);
      }
      prevHash = ev.hash;
    }
    return true;
  }

  try {
    verifyLedger(ledger);
    console.log("✅ Ledger verification passed: H1 -> H2 -> H3");
  } catch (err: any) {
    console.error("❌ Ledger verification failed:", err.message);
    process.exit(1);
  }

  console.log("\n4. Tamper Test: Modifying H2 (.env DENY event)...");
  // Deep copy the ledger
  const tamperedLedger = JSON.parse(JSON.stringify(ledger));
  
  // Find the .env event (which was DENIED) and change it to ALLOW
  const envEvent = tamperedLedger.find((e: any) => e.resource === ".env");
  if (!envEvent) {
    throw new Error("Could not find .env event in ledger");
  }
  
  const originalDecision = envEvent.decision;
  envEvent.decision = "ALLOW";
  console.log(`- Altered event ${envEvent.eventId} decision from ${originalDecision} to ${envEvent.decision}`);

  try {
    verifyLedger(tamperedLedger);
    console.error("❌ Tamper test failed: The modified ledger was incorrectly verified as valid!");
    process.exit(1);
  } catch (err: any) {
    console.log("✅ Tamper test passed: Ledger verification correctly rejected tampered event.");
    console.log(`   Rejection reason: ${err.message}`);
  }

  console.log("\n=== PHASE 2 TEST SUCCESSFUL ===");
}

testPhase2().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
