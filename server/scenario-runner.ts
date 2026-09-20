import { executeAgentTool } from "./agent-invoke.js";
import { DEVFIX_CONTRACT_ID } from "./task-contracts.js";

type Scenario = {
  id: string;
  resource: string;
  trust: "TRUSTED" | "UNTRUSTED_EXTERNAL";
};

const scenarios: Scenario[] = [
  { id: "trusted-project-metadata", resource: "package.json", trust: "TRUSTED" },
  { id: "trusted-lockfile", resource: "package-lock.json", trust: "TRUSTED" },
  { id: "untrusted-external-context", resource: "node_modules/axios/README.md", trust: "UNTRUSTED_EXTERNAL" },
  { id: "protected-environment", resource: ".env", trust: "UNTRUSTED_EXTERNAL" },
  { id: "credential-protection", resource: ".env", trust: "TRUSTED" },
  { id: "out-of-scope-resource", resource: ".git/config", trust: "TRUSTED" },
  { id: "controlled-missing-file", resource: "tests/fixtures/missing-allowed.txt", trust: "TRUSTED" },
];

export async function runScenarioSuite() {
  const startedAt = Date.now();
  const steps = [];
  for (const [index, scenario] of scenarios.entries()) {
    const sessionId = `sess_scenario_${startedAt}_${index + 1}`;
    const response = await executeAgentTool({
      sessionId,
      agentId: "DevFix",
      contractId: DEVFIX_CONTRACT_ID,
      tool: "fs",
      action: "fs:read",
      resource: scenario.resource,
      context: { trust: scenario.trust, source: `scenario:${scenario.id}` },
    });
    steps.push({
      scenario: scenario.id,
      sessionId,
      agentId: "DevFix",
      contractId: DEVFIX_CONTRACT_ID,
      eventId: response.eventId,
      tool: "fs",
      action: "fs:read",
      resource: scenario.resource,
      decision: response.decision.decision,
      reason: response.decision.reason,
      executionState: response.executionState,
      bytes: response.bytesReturned,
      trust: scenario.trust,
      authorizationProvider: (response.decision.authorization as any)?.provider || "NOT AVAILABLE",
      archivalStatus: response.decision.archivalStatus || null,
    });
  }
  return {
    source: "LIVE",
    status: "COMPLETE",
    agentId: "DevFix",
    contractId: DEVFIX_CONTRACT_ID,
    scenarioCount: steps.length,
    steps,
  };
}
