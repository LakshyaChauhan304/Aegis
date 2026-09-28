import crypto from "crypto";
import { executeAgentTool } from "./agent-invoke.js";
import { DEVFIX_CONTRACT_ID, ToolRequest } from "./task-contracts.js";

type RunnerStep = {
  eventId: string;
  tool: string;
  action: string;
  resource: string;
  decision: string;
  executionState: string;
  bytes: number;
  trust: string;
  reason?: string;
};

type RunnerState = {
  nextResource: string;
  inspected: string[];
};

function createSessionId() {
  return `sess_devfix_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

function chooseNext(state: RunnerState, last: Awaited<ReturnType<typeof executeAgentTool>> | null) {
  if (!last) return { resource: "package.json", trust: "TRUSTED" };
  state.inspected.push(state.nextResource);

  if (last.decision.decision === "DENY") {
    return null;
  }
  if (state.nextResource === "package.json") return { resource: "package-lock.json", trust: "TRUSTED" };
  if (state.nextResource === "package-lock.json") return { resource: "node_modules/axios/README.md", trust: "UNTRUSTED_EXTERNAL" };
  if (state.nextResource === "node_modules/axios/README.md") return { resource: ".env", trust: "UNTRUSTED_EXTERNAL" };
  return null;
}

export async function runDevFix(input: { contractId: string }) {
  const sessionId = createSessionId();
  const agentId = "DevFix";
  const contractId = input.contractId;
  const state: RunnerState = { nextResource: "", inspected: [] };
  const steps: RunnerStep[] = [];
  let next = chooseNext(state, null);

  while (next) {
    state.nextResource = next.resource;
    const request: ToolRequest = {
      sessionId,
      agentId,
      contractId,
      tool: "fs",
      action: "fs:read",
      resource: next.resource,
      context: {
        trust: next.trust,
        source: "devfix-reference-runner",
      },
    };
    const response = await executeAgentTool(request);
    const reason = response.decision.reason || response.error;
    steps.push({
      eventId: response.eventId,
      tool: request.tool,
      action: request.action,
      resource: request.resource,
      decision: response.decision.decision,
      executionState: response.executionState,
      bytes: response.bytesReturned,
      trust: request.context.trust,
      ...(reason ? { reason } : {}),
    });

    next = chooseNext(state, response);
  }

  return {
    sessionId,
    agentId,
    contractId,
    status: "COMPLETE",
    steps,
  };
}
