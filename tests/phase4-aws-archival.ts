import crypto from 'crypto';
import { authHeaders } from "./test-auth.ts";

async function testPhase4() {
  console.log("=== PHASE 4: AWS EVENTBRIDGE, DYNAMODB, & S3 ARCHIVAL TEST ===");

  async function invoke(tool: string, action: string, resource: string, trust: string) {
    const res = await fetch("http://localhost:3000/api/agent/invoke", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        sessionId: "sess_aws_test_" + Date.now(),
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

  console.log("\n1. Generating an AUTHORIZED event (package.json) to test secret exclusion and archival...");
  const resA = await invoke("fs", "fs:read", "package.json", "TRUSTED");
  
  if (resA.decision?.decision !== "ALLOW") {
    throw new Error("Expected ALLOW for package.json but got " + resA.decision?.decision);
  }

  // Ensure result payload contains file contents (because it was allowed)
  if (!resA.result || typeof resA.result !== 'string' || !resA.result.includes('"name": "react-example"')) {
    throw new Error("Expected actual file contents in response result for ALLOWED request");
  }

  console.log("\n2. Analyzing AWS archival outcomes...");
  const status = resA.decision?.archivalStatus;
  console.log(JSON.stringify(status, null, 2));

  if (!status) {
    throw new Error("Missing archivalStatus in decision payload");
  }

  const reportArchival = (name: string, result: { status: string; eventId?: string; error?: string }) => {
    if (result.status === "success") {
      const detail = result.eventId ? ` (eventId: ${result.eventId})` : "";
      console.log(`[LIVE] ${name} archival succeeded${detail}.`);
      return;
    }

    if (result.status === "failed") {
      console.log(`[DEGRADED] ${name} archival failed gracefully: ${result.error || "unknown error"}`);
      return;
    }

    throw new Error(`${name} archival remained in unexpected status: ${result.status}`);
  };

  reportArchival("EventBridge", status.eventBridge);
  reportArchival("DynamoDB", status.dynamoDb);
  reportArchival("S3 Object Lock", status.s3);
  console.log("\n3. Testing Secret Exclusion in the Evidence Ledger...");
  
  const ledgerRes = await fetch("http://localhost:3000/api/agent/ledger", { headers: authHeaders() });
  const ledger = await ledgerRes.json();
  
  // Find the event we just generated
  const latestEvent = ledger.find((e: any) => e.eventId === resA.decision?.eventId);
  if (!latestEvent) {
    throw new Error("Could not find the generated event in the ledger");
  }

  // Double check that the ledger record DOES NOT contain the file payload
  const stringifiedEvent = JSON.stringify(latestEvent);
  if (stringifiedEvent.includes("react-example")) {
    throw new Error("CRITICAL SECURITY FAILURE: File contents leaked into the Evidence Event!");
  } else {
    console.log("Secret exclusion verified: Evidence Event contains NO file contents.");
  }

  console.log(`\nEvent structure recorded in the local ledger:\n${JSON.stringify(latestEvent, null, 2)}`);

  console.log("\n=== PHASE 4 TEST COMPLETE ===");
}

testPhase4().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
