import { CONTRACT, SESSION } from "../../data/fixtures.js";

export type RuntimeNodeId =
  | "devfix"
  | "request"
  | "contract"
  | "context"
  | "cedar"
  | "approved"
  | "rejected"
  | "decision"
  | "tool"
  | "evidence"
  | "hash"
  | "investigation";

export type RuntimeBranch = "approved" | "rejected" | "neutral";
export type RuntimeDemoMode = "allow" | "deny";
export type RuntimeCedarDecision = "ALLOW" | "DENY";

export type RuntimeNode = {
  id: RuntimeNodeId;
  label: string;
  subtitle: string;
  branch: RuntimeBranch;
  position: [number, number, number];
};

export type RuntimeRail = {
  id: string;
  from: RuntimeNodeId;
  to: RuntimeNodeId;
  branch: RuntimeBranch;
};

export type RuntimeEventLike = {
  seq?: number;
  id?: string;
  eventId?: string;
  timestamp?: string | null;
  sessionId?: string | null;
  agentId?: string | null;
  contractId?: string | null;
  action?: string;
  resource?: string;
  trust?: string;
  decision?: string;
  reason?: string;
  authProvider?: string;
  execution?: string;
  curr?: string | null;
  prev?: string | null;
  currentHash?: string | null;
  previousHash?: string | null;
  hash?: string | null;
};

export type RuntimeChainLike = {
  verified?: boolean;
  ok?: number;
  total?: number;
};

export type RuntimeAnalysisLike = {
  generatedBy?: string;
  whatHappened?: string[];
  refs?: string[];
  basis?: string[];
};

export type RuntimeRoute = {
  activeBranch: RuntimeBranch;
  toolExecutes: boolean;
  waypoints: RuntimeNodeId[];
};

export type RuntimeInspectorRow = {
  label: string;
  value: string;
};

export type RuntimeInspector = {
  title: string;
  subtitle: string;
  rows: RuntimeInspectorRow[];
};

export type RuntimeComponentExplanation = {
  whatItDoes: string;
  howItWorks: string;
  runtimeRole: string;
  securityBoundary: string;
  relatedComponents: string;
};

export const RUNTIME_VISUAL_DETAIL = {
  palette: {
    stage: "light-editorial-machine",
    machineShell: "off-white",
    accentApproved: "green",
    accentRejected: "red-orange",
    technicalAccent: "orange",
  },
  modules: {
    cedar: {
      minimumParts: 34,
      parts: [
        "outer housing",
        "inner housing",
        "transparent inspection window",
        "authorization core",
        "mechanical rings",
        "circuit elements",
        "connectors",
        "mounting brackets",
        "status indicators",
        "leader lines",
      ],
    },
    decision: { minimumParts: 18 },
    tool: { minimumParts: 16 },
  },
  inspectionLabels: [
    "CEDAR AUTHORIZATION CORE",
    "DECISION GATE",
    "CONTEXT / PROVENANCE",
    "PROTECTED TOOL",
    "EVIDENCE RECORD",
    "SHA-256 CHAIN",
  ],
};

export const RUNTIME_INTERACTION_MODEL = {
  cameraControls: ["ZOOM IN", "ZOOM OUT", "RESET VIEW", "FULL VIEW"],
  demoModes: ["ALLOW DEMO", "DENY / ERROR DEMO"],
  replayControl: "REPLAY DEMO",
  liveEventData: "displayed separately from demo mode",
  runtimeDecisionPoint: "Cedar produces ALLOW or DENY after the request reaches Cedar",
  fullViewBehavior: "architecture camera only; runtime route remains selected demo route",
  viewModes: ["NORMAL", "FOCUSED", "FULL", "INSPECTION"],
  inspectionNavigation: ["physical component click", "wheel zoom", "ctrl-wheel pinch zoom", "back to architecture"],
  inspectionPlayback: "selected component slows demo without changing runtime route",
  selectionWorkspace: {
    left: "semantic inspector",
    right: "main scene hero inspection",
  },
  sceneInstances: 1,
  rendererInstances: 1,
  canvasInstances: 1,
  animationLoops: 1,
  requestObject: "single physical ball",
  requestMotion: "single pass stops at endpoint",
};

export const RUNTIME_INSPECTION_NAVIGATION_ORDER: RuntimeNodeId[] = [
  "devfix",
  "request",
  "contract",
  "context",
  "cedar",
  "decision",
  "tool",
  "evidence",
  "hash",
  "investigation",
];

export const RUNTIME_COMPONENT_EXPLANATIONS: Record<RuntimeNodeId, RuntimeComponentExplanation> = {
  devfix: {
    whatItDoes: "Represents the agent initiating the task or request.",
    howItWorks: "Agent, session, and task identity form the starting point of the runtime flow before a request enters the control plane.",
    runtimeRole: "Request initiator",
    securityBoundary: "The agent is not the authorization authority; requests are evaluated downstream before protected execution.",
    relatedComponents: "DevFix -> Request -> Task Contract",
  },
  request: {
    whatItDoes: "Represents the action and resource request entering the runtime control plane.",
    howItWorks: "The request carries action, resource, session, agent, and relevant context toward the authorization pipeline.",
    runtimeRole: "Runtime input",
    securityBoundary: "The request is inspected before it can reach the protected tool.",
    relatedComponents: "DevFix -> Request -> Contract -> Context",
  },
  contract: {
    whatItDoes: "Defines the intended task scope and permitted operating boundaries.",
    howItWorks: "The contract establishes relevant task scope before execution reaches protected tooling.",
    runtimeRole: "Declared scope",
    securityBoundary: "Contract scope informs authorization; it is not a post-hoc explanation for bypassing policy.",
    relatedComponents: "Request -> Task Contract -> Context",
  },
  context: {
    whatItDoes: "Carries contextual and provenance information associated with the request.",
    howItWorks: "Context is evaluated as part of authorization and downstream handling; UNTRUSTED_EXTERNAL records origin/provenance and is not an automatic claim of malicious intent.",
    runtimeRole: "Provenance input",
    securityBoundary: "Context informs Cedar evaluation before protected tool execution.",
    relatedComponents: "Contract -> Context -> Cedar",
  },
  cedar: {
    whatItDoes: "Cedar is the runtime authorization authority for the selected request.",
    howItWorks: "Principal, action, resource, and context enter the policy core; Cedar evaluates policy and produces ALLOW or DENY for the decision gate to enforce.",
    runtimeRole: "Authorization authority",
    securityBoundary: "Authorization happens before protected tool execution reaches the PEP boundary.",
    relatedComponents: "Context -> Cedar -> Decision Gate",
  },
  approved: {
    whatItDoes: "Represents the ALLOW output path from authorization.",
    howItWorks: "When the current decision is ALLOW, the request proceeds toward the decision gate and protected tool.",
    runtimeRole: "Allowed route",
    securityBoundary: "This branch is active only when event.decision is ALLOW.",
    relatedComponents: "Cedar -> Approved Rail -> Decision Gate",
  },
  rejected: {
    whatItDoes: "Represents the DENY stop path from authorization.",
    howItWorks: "When the current decision is DENY, the protected-tool path remains blocked and the event still proceeds to evidence.",
    runtimeRole: "Rejected route",
    securityBoundary: "This branch prevents protected-tool execution when event.decision is DENY.",
    relatedComponents: "Cedar -> Stop / Lock -> Evidence",
  },
  decision: {
    whatItDoes: "Represents the enforcement point and PEP boundary.",
    howItWorks: "ALLOW opens the execution path; DENY keeps the protected-tool path locked.",
    runtimeRole: "Policy enforcement point",
    securityBoundary: "The PEP enforces the authorization result before protected execution.",
    relatedComponents: "Cedar -> Decision Gate -> Protected Tool",
  },
  tool: {
    whatItDoes: "Represents the protected execution target.",
    howItWorks: "Execution is reachable only after the authorization and enforcement boundary permits it.",
    runtimeRole: "Protected tool",
    securityBoundary: "The tool is downstream of Cedar and the decision gate.",
    relatedComponents: "Decision Gate -> Protected Tool -> Approved End",
  },
  evidence: {
    whatItDoes: "Records the runtime event for accountability and later analysis.",
    howItWorks: "Decision and execution information become part of the evidence record after the runtime decision.",
    runtimeRole: "Evidence recording",
    securityBoundary: "Evidence records what happened; it does not authorize execution.",
    relatedComponents: "Stop / Lock -> Evidence -> Hash Chain",
  },
  hash: {
    whatItDoes: "Represents chained integrity relationships between recorded events.",
    howItWorks: "The current event links to the previous hash, creating the recorded chain relationship.",
    runtimeRole: "Integrity chain",
    securityBoundary: "The hash chain protects recorded evidence integrity; it is not a runtime authorization gate.",
    relatedComponents: "Evidence -> Hash Chain -> Investigation",
  },
  investigation: {
    whatItDoes: "Provides post-hoc investigation and analysis over recorded evidence.",
    howItWorks: "Recorded evidence enters the investigation module after the runtime path, producing analysis from evidence rather than authorization.",
    runtimeRole: "Post-hoc investigation",
    securityBoundary: "POST-HOC analysis only. ZERO RUNTIME AUTHORIZATION AUTHORITY.",
    relatedComponents: "Evidence -> Hash Chain -> Investigation",
  },
};

export const RUNTIME_ARCHITECTURE_NODES: RuntimeNode[] = [
  { id: "devfix", label: "DEVFIX", subtitle: "reference agent", branch: "neutral", position: [-16, 0, 0] },
  { id: "request", label: "REQUEST", subtitle: "tool invocation", branch: "neutral", position: [-12.5, 0, 0] },
  { id: "contract", label: "TASK CONTRACT", subtitle: "declared scope", branch: "neutral", position: [-8.5, 0, 0] },
  { id: "context", label: "CONTEXT", subtitle: "provenance", branch: "neutral", position: [-4.5, 0, 0] },
  { id: "cedar", label: "CEDAR", subtitle: "authorization engine", branch: "neutral", position: [0, 0, 0] },
  { id: "approved", label: "ALLOW", subtitle: "approved path", branch: "approved", position: [4, 0, -3.1] },
  { id: "decision", label: "DECISION GATE", subtitle: "PEP boundary", branch: "approved", position: [8, 0, -3.1] },
  { id: "tool", label: "filesystem.read", subtitle: "protected tool", branch: "approved", position: [12, 0, -3.1] },
  { id: "rejected", label: "STOP / LOCK", subtitle: "deny branch", branch: "rejected", position: [5, 0, 3.1] },
  { id: "evidence", label: "EVIDENCE", subtitle: "recording module", branch: "rejected", position: [12, 0, 3.1] },
  { id: "hash", label: "SHA-256", subtitle: "hash chain", branch: "rejected", position: [16, 0, 3.1] },
  { id: "investigation", label: "INVESTIGATION", subtitle: "post-hoc", branch: "rejected", position: [20, 0, 3.1] },
];

export const RUNTIME_ARCHITECTURE_RAILS: RuntimeRail[] = [
  { id: "rail-devfix-request", from: "devfix", to: "request", branch: "neutral" },
  { id: "rail-request-contract", from: "request", to: "contract", branch: "neutral" },
  { id: "rail-contract-context", from: "contract", to: "context", branch: "neutral" },
  { id: "rail-context-cedar", from: "context", to: "cedar", branch: "neutral" },
  { id: "rail-cedar-approved", from: "cedar", to: "approved", branch: "approved" },
  { id: "rail-approved-decision", from: "approved", to: "decision", branch: "approved" },
  { id: "rail-decision-tool", from: "decision", to: "tool", branch: "approved" },
  { id: "rail-cedar-rejected", from: "cedar", to: "rejected", branch: "rejected" },
  { id: "rail-rejected-evidence", from: "rejected", to: "evidence", branch: "rejected" },
  { id: "rail-evidence-hash", from: "evidence", to: "hash", branch: "rejected" },
  { id: "rail-hash-investigation", from: "hash", to: "investigation", branch: "rejected" },
];

export function nodeById(id: RuntimeNodeId) {
  return RUNTIME_ARCHITECTURE_NODES.find((node) => node.id === id);
}

export function getRuntimeArchitectureRoute(event?: RuntimeEventLike | null): RuntimeRoute {
  if (event?.decision === "ALLOW") {
    return {
      activeBranch: "approved",
      toolExecutes: true,
      waypoints: ["devfix", "request", "contract", "context", "cedar", "approved", "decision", "tool"],
    };
  }

  if (event?.decision === "DENY") {
    return {
      activeBranch: "rejected",
      toolExecutes: false,
      waypoints: ["devfix", "request", "contract", "context", "cedar", "rejected", "evidence", "hash", "investigation"],
    };
  }

  return {
    activeBranch: "neutral",
    toolExecutes: false,
    waypoints: ["devfix", "request", "contract", "context", "cedar", "evidence", "hash", "investigation"],
  };
}

export function getRuntimeArchitectureRouteForDecision(decision: RuntimeCedarDecision): RuntimeRoute {
  if (decision === "ALLOW") {
    return {
      activeBranch: "approved",
      toolExecutes: true,
      waypoints: ["devfix", "request", "contract", "context", "cedar", "approved", "decision", "tool"],
    };
  }

  return {
    activeBranch: "rejected",
    toolExecutes: false,
    waypoints: ["devfix", "request", "contract", "context", "cedar", "rejected", "evidence", "hash", "investigation"],
  };
}

export function getRuntimeArchitectureDemoRoute(mode: RuntimeDemoMode): RuntimeRoute {
  return getRuntimeArchitectureRouteForDecision(mode === "allow" ? "ALLOW" : "DENY");
}

function present(value: any) {
  return value !== undefined && value !== null && value !== "";
}

function add(rows: RuntimeInspectorRow[], label: string, value: any) {
  if (present(value)) rows.push({ label, value: String(value) });
}

export function buildRuntimeArchitectureInspector(
  selected: RuntimeNodeId | null,
  event?: RuntimeEventLike | null,
  chain?: RuntimeChainLike | null,
  analysis?: RuntimeAnalysisLike | null
): RuntimeInspector {
  const node = nodeById(selected || "cedar") || RUNTIME_ARCHITECTURE_NODES[4];
  const rows: RuntimeInspectorRow[] = [];
  const eventId = event?.eventId || event?.id;
  const currentHash = event?.curr || event?.currentHash || event?.hash;
  const previousHash = event?.prev || event?.previousHash;

  if (selected === "cedar") {
    add(rows, "Principal", event?.agentId);
    add(rows, "Action", event?.action);
    add(rows, "Resource", event?.resource);
    add(rows, "Context", event?.trust);
    add(rows, "Decision", event?.decision);
    add(rows, "Provider", event?.authProvider);
  } else if (selected === "decision" || selected === "approved" || selected === "rejected") {
    add(rows, "Decision", event?.decision);
    add(rows, "Execution", event?.execution);
    add(rows, "Reason", event?.reason);
    add(rows, "Event", eventId);
  } else if (selected === "tool") {
    add(rows, "Tool", event?.action);
    add(rows, "Resource", event?.resource);
    add(rows, "Execution", event?.execution);
    add(rows, "Decision", event?.decision);
    add(rows, "Event", eventId);
  } else if (selected === "evidence") {
    add(rows, "Event ID", eventId);
    add(rows, "Timestamp", event?.timestamp);
    add(rows, "Session", event?.sessionId);
    add(rows, "Agent", event?.agentId);
    add(rows, "Action", event?.action);
    add(rows, "Resource", event?.resource);
    add(rows, "Decision", event?.decision);
    add(rows, "Reason", event?.reason);
    add(rows, "Provider", event?.authProvider);
    add(rows, "Current hash", currentHash);
    add(rows, "Previous hash", previousHash);
  } else if (selected === "hash") {
    add(rows, "Current event", eventId);
    add(rows, "Current hash", currentHash);
    add(rows, "Previous hash", previousHash);
    add(rows, "Chain position", event?.seq);
    if (chain && present(chain.verified)) add(rows, "Verification", chain.verified ? "verified" : "failed");
    if (chain && present(chain.ok) && present(chain.total)) add(rows, "Verified links", `${chain.ok}/${chain.total}`);
  } else if (selected === "investigation") {
    add(rows, "Mode", "POST-HOC");
    add(rows, "Investigation event", eventId);
    add(rows, "Evidence input", eventId);
    add(rows, "Generated by", analysis?.generatedBy);
    add(rows, "Evidence refs", analysis?.refs?.join(", "));
    add(rows, "Basis", analysis?.basis?.join(" / "));
    add(rows, "Result", analysis?.whatHappened?.[0]);
  } else if (selected === "devfix") {
    add(rows, "Agent", event?.agentId || SESSION.agentName);
    add(rows, "Session", event?.sessionId || SESSION.id);
    add(rows, "Task", event?.contractId || SESSION.contractId);
    add(rows, "Current state", event?.decision === "DENY" ? "HALTED_AT_DENY" : SESSION.state);
    add(rows, "Current event", eventId);
  } else if (selected === "contract") {
    add(rows, "Contract ID", event?.contractId || CONTRACT.id);
    add(rows, "Agent", CONTRACT.agent);
    add(rows, "Purpose", CONTRACT.purpose);
    add(rows, "Filesystem scope", CONTRACT.fsAllow.join(", "));
    add(rows, "Network scope", CONTRACT.network.join(", "));
    add(rows, "Tool scope", CONTRACT.tools.join(", "));
    add(rows, "Approval", CONTRACT.deployment);
  } else if (selected === "context") {
    add(rows, "Source", event?.resource);
    add(rows, "Context type", "provenance label");
    add(rows, "Classification", event?.trust);
    add(rows, "Meaning", "Records origin/provenance for downstream Cedar handling; it is not an automatic claim of malicious intent.");
    add(rows, "Downstream handling", event?.decision);
    add(rows, "Event", eventId);
  } else if (selected === "request") {
    add(rows, "Action", event?.action);
    add(rows, "Resource", event?.resource);
    add(rows, "Agent", event?.agentId);
    add(rows, "Session", event?.sessionId);
    add(rows, "Context", event?.trust);
    add(rows, "Decision", event?.decision);
    add(rows, "Event", eventId);
  }

  if (!rows.length) {
    add(rows, "Current event", eventId);
    add(rows, "Decision", event?.decision);
  }

  return {
    title: node.label,
    subtitle: node.subtitle,
    rows,
  };
}
