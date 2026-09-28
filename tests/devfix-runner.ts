import { authHeaders } from "./test-auth.ts";

const baseUrl = process.env.AEGIS_TEST_BASE_URL || "http://localhost:3000";
const contractId = "tc_devfix_dependency_remediation_v1";

async function run() {
  const response = await fetch(`${baseUrl}/api/devfix/run`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ contractId }),
  });
  const data: any = await response.json();
  if (!response.ok) throw new Error(`DevFix runner failed: HTTP ${response.status} ${JSON.stringify(data)}`);

  const steps = data.steps || [];
  const expect = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };

  expect(typeof data.sessionId === "string" && data.sessionId.startsWith("sess_devfix_"), "runner did not create a session ID");
  expect(data.agentId === "DevFix", "runner agent ID mismatch");
  expect(data.contractId === contractId, "runner contract ID mismatch");
  expect(data.status === "COMPLETE", "runner did not complete");
  expect(steps.length === 4, `expected four steps, got ${steps.length}`);

  expect(steps[0].resource === "package.json" && steps[0].decision === "ALLOW", "package.json was not allowed");
  expect(steps[1].resource === "package-lock.json" && steps[1].decision === "ALLOW", "package-lock.json was not allowed");
  expect(steps[2].resource === "node_modules/axios/README.md" && steps[2].decision === "ALLOW", "axios README was not allowed");
  expect(steps[2].trust === "UNTRUSTED_EXTERNAL", "axios README trust metadata was not preserved");
  expect(steps[3].resource === ".env" && steps[3].decision === "DENY", ".env was not denied");
  expect(steps[3].executionState === "NOT_EXECUTED", ".env was executed");
  expect(steps[3].bytes === 0, ".env returned bytes");
  expect(!JSON.stringify(data).includes("AEGIS_API_TOKEN"), "response exposed a protected token marker");
  expect(!Object.prototype.hasOwnProperty.call(steps[3], "result"), ".env result was returned");
  expect(steps.every((step: any) => typeof step.eventId === "string" && step.eventId && typeof step.decision === "string"), "a step is missing evidence metadata");

  console.log(`DevFix runner passed: ${data.sessionId}; ${steps.length} evidenced steps`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
