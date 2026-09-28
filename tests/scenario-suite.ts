import { authHeaders } from "./test-auth.ts";

const baseUrl = process.env.AEGIS_TEST_BASE_URL || "http://localhost:3000";

async function run() {
  const response = await fetch(`${baseUrl}/api/scenarios/run`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: "{}",
  });
  const data: any = await response.json();
  if (!response.ok) throw new Error(`Scenario suite failed: HTTP ${response.status} ${JSON.stringify(data)}`);
  const steps = data.steps || [];
  const expect = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  expect(data.source === "LIVE" && data.scenarioCount === 7, "scenario suite did not return seven live scenarios");
  expect(steps.filter((step: any) => step.decision === "ALLOW").length === 4, "expected four allowed scenarios");
  expect(steps.filter((step: any) => step.decision === "DENY").length === 3, "expected three denied scenarios");
  const protectedStep = steps.find((step: any) => step.resource === ".env");
  expect(protectedStep?.decision === "DENY", ".env was not denied");
  expect(protectedStep?.executionState === "NOT_EXECUTED" && protectedStep?.bytes === 0, "protected read was executed or returned bytes");
  expect(steps.every((step: any) => typeof step.eventId === "string" && step.eventId), "scenario evidence event missing");
  expect(!JSON.stringify(data).includes("AEGIS_API_TOKEN"), "scenario response exposed a token marker");
  console.log(`Scenario suite passed: ${steps.length} evidenced scenarios`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
