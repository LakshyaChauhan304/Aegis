import crypto from "crypto";
import { authFetch, authHeaders } from "./test-auth.ts";

async function json(path: string, init?: RequestInit) {
  const res = path.startsWith("/api/aegis/status") || path.startsWith("/api/aegis/capabilities")
    ? await fetch(`http://localhost:3000${path}`, init)
    : await authFetch(path, init);
  const data = await res.json();
  return { res, data };
}

async function testPhase7TruthBoundary() {
  console.log("=== PHASE 7: UI TRUTH MODEL & BOUNDARY REGRESSION TEST ===");

  console.log("\n1. Verifying policy endpoint returns actual Cedar source and hash...");
  const policy = await json("/api/aegis/policy");
  if (policy.res.status !== 200) throw new Error("Policy endpoint failed");
  if (!policy.data.sourceText || !policy.data.sourceText.includes('Aegis::Agent::"DevFix"')) {
    throw new Error("Policy endpoint did not return current Cedar source");
  }
  const computedHash = crypto.createHash("sha256").update(policy.data.sourceText).digest("hex");
  if (computedHash !== policy.data.hash) {
    throw new Error(`Policy hash mismatch: expected ${computedHash}, got ${policy.data.hash}`);
  }
  console.log("✅ Current Cedar policy source and SHA-256 hash verified.");

  console.log("\n2. Verifying status endpoint classifies AWS without overclaiming live state...");
  const status = await json("/api/aegis/status");
  if (status.res.status !== 200) throw new Error("Status endpoint failed");
  const kms = status.data.aws.find((s: any) => s.name === "AWS KMS");
  if (!kms || kms.state !== "UNAVAILABLE") {
    throw new Error(`Expected KMS UNAVAILABLE, got ${kms?.state}`);
  }
  for (const service of status.data.aws) {
    if (service.state === "LIVE_VERIFIED") {
      console.log(`- ${service.name}: LIVE_VERIFIED based on recorded process state`);
    } else if (!["SDK_READY", "UNAVAILABLE"].includes(service.state)) {
      throw new Error(`Unexpected AWS state for ${service.name}: ${service.state}`);
    }
  }
  console.log("✅ AWS truth model avoids treating SDK integration as live verification.");

  console.log("\n3. Verifying unsupported shell execution does not run as a hero shortcut...");
  const shell = await json("/api/agent/invoke", {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      sessionId: "sess_truth_" + Date.now(),
      agentId: "DevFix",
      contractId: "tc_devfix_dependency_remediation_v1",
      tool: "shell",
      action: "shell:exec",
      resource: "npm audit --json",
      context: { trust: "TRUSTED" }
    })
  });
  if (shell.res.status === 200 && shell.data.result) {
    throw new Error("Unsupported shell action unexpectedly executed");
  }
  console.log(`✅ Unsupported shell action did not execute. HTTP ${shell.res.status}.`);

  console.log("\n4. Verifying DENY still blocks protected filesystem execution and omits Bedrock...");
  const deny = await json("/api/agent/invoke", {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      sessionId: "sess_truth_" + Date.now(),
      agentId: "DevFix",
      contractId: "tc_devfix_dependency_remediation_v1",
      tool: "fs",
      action: "fs:read",
      resource: ".env",
      context: { trust: "UNTRUSTED_EXTERNAL" }
    })
  });
  if (deny.res.status !== 403 || deny.data.decision?.decision !== "DENY") {
    throw new Error(`Expected DENY 403, got ${deny.res.status} ${deny.data.decision?.decision}`);
  }
  if (deny.data.result) {
    throw new Error("DENY response leaked protected result bytes");
  }
  if (deny.data.decision?.investigationStatus) {
    throw new Error("Runtime DENY response included Bedrock investigation status");
  }
  console.log("✅ DENY prevents protected execution and does not require Bedrock.");

  console.log("\n=== PHASE 7 TEST COMPLETE ===");
}

testPhase7TruthBoundary().catch(err => {
  console.error("Phase 7 truth boundary test failed:", err);
  process.exit(1);
});
