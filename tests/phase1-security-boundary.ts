import { authHeaders } from "./test-auth.ts";

async function testAegis() {
  console.log("--- TEST A: READ package.json ---");
  const resA = await fetch("http://localhost:3000/api/agent/invoke", {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      sessionId: "test-sess",
      agentId: "DevFix",
      contractId: "tc_devfix_dependency_remediation_v1",
      tool: "fs",
      resource: "package.json",
      action: "fs:read",
      context: { trust: "TRUSTED" }
    })
  });
  const dataA = await resA.json();
  console.log("Status:", resA.status);
  console.log("Decision:", dataA.decision?.decision);
  console.log("Result starts with:", typeof dataA.result === "string" ? dataA.result.substring(0, 50).replace(/\n/g, "") : dataA.result);

  console.log("\n--- TEST B: READ .env ---");
  const resB = await fetch("http://localhost:3000/api/agent/invoke", {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      sessionId: "test-sess",
      agentId: "DevFix",
      contractId: "tc_devfix_dependency_remediation_v1",
      tool: "fs",
      resource: ".env",
      action: "fs:read",
      context: { trust: "UNTRUSTED_EXTERNAL" }
    })
  });
  const dataB = await resB.json();
  console.log("Status:", resB.status);
  console.log("Decision:", dataB.decision?.decision);
  console.log("Error:", dataB.error);
}
testAegis();
