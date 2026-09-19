import {
  RUNTIME_ARCHITECTURE_NODES,
  RUNTIME_ARCHITECTURE_RAILS,
  RUNTIME_COMPONENT_EXPLANATIONS,
  RUNTIME_INSPECTION_NAVIGATION_ORDER,
  RUNTIME_INTERACTION_MODEL,
  RUNTIME_VISUAL_DETAIL,
  buildRuntimeArchitectureInspector,
  getRuntimeArchitectureDemoRoute,
  getRuntimeArchitectureRouteForDecision,
  getRuntimeArchitectureRoute,
} from "../src/components/viz/AegisRuntimeArchitectureModel.ts";

function assert(condition: any, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function ids(list: Array<{ id: string }>) {
  return new Set(list.map((item) => item.id));
}

function testRuntimeTopology() {
  const nodeIds = ids(RUNTIME_ARCHITECTURE_NODES);
  for (const id of [
    "devfix",
    "request",
    "contract",
    "context",
    "cedar",
    "decision",
    "approved",
    "rejected",
    "tool",
    "evidence",
    "hash",
    "investigation",
  ]) {
    assert(nodeIds.has(id), `Missing runtime architecture node ${id}`);
  }

  const railKeys = new Set(RUNTIME_ARCHITECTURE_RAILS.map((rail) => `${rail.from}->${rail.to}`));
  for (const edge of [
    "devfix->request",
    "request->contract",
    "contract->context",
    "context->cedar",
    "cedar->approved",
    "cedar->rejected",
    "approved->decision",
    "decision->tool",
    "rejected->evidence",
    "evidence->hash",
    "hash->investigation",
  ]) {
    assert(railKeys.has(edge), `Missing physical rail ${edge}`);
  }
}

function testDecisionRoutes() {
  const allow = getRuntimeArchitectureRoute({ decision: "ALLOW" });
  assert(allow.activeBranch === "approved", `ALLOW should activate approved route, got ${allow.activeBranch}`);
  assert(allow.toolExecutes === true, "ALLOW should execute protected tool");
  assert(allow.waypoints.includes("tool"), "ALLOW route should travel through protected tool");
  assert(!allow.waypoints.includes("rejected"), "ALLOW route should not enter rejected rail");
  assert(allow.waypoints[allow.waypoints.length - 1] === "tool", "ALLOW route should terminate at the protected tool endpoint");
  assert(!allow.waypoints.includes("evidence"), "ALLOW route must not reconnect to evidence");
  assert(!allow.waypoints.includes("hash"), "ALLOW route must not continue to hash");
  assert(!allow.waypoints.includes("investigation"), "ALLOW route must not continue to investigation");

  const deny = getRuntimeArchitectureRoute({ decision: "DENY" });
  assert(deny.activeBranch === "rejected", `DENY should activate rejected route, got ${deny.activeBranch}`);
  assert(deny.toolExecutes === false, "DENY should not execute protected tool");
  assert(deny.waypoints.includes("rejected"), "DENY route should enter rejected rail");
  assert(!deny.waypoints.includes("tool"), "DENY route should not travel through protected tool");
  assert(deny.waypoints.join(">").endsWith("evidence>hash>investigation"), "DENY route should continue through evidence, hash, and investigation");
}

function testExplicitDemoRoutesAreIndependentFromLiveEventState() {
  const allowDemo = getRuntimeArchitectureDemoRoute("allow");
  assert(allowDemo.activeBranch === "approved", `ALLOW demo should activate approved route, got ${allowDemo.activeBranch}`);
  assert(allowDemo.toolExecutes === true, "ALLOW demo should execute protected tool path");
  assert(
    allowDemo.waypoints.join(">") === "devfix>request>contract>context>cedar>approved>decision>tool",
    `ALLOW demo route should terminate at tool, got ${allowDemo.waypoints.join(">")}`
  );
  assert(!allowDemo.waypoints.includes("evidence"), "ALLOW demo must never enter evidence");
  assert(!allowDemo.waypoints.includes("hash"), "ALLOW demo must never enter hash");
  assert(!allowDemo.waypoints.includes("investigation"), "ALLOW demo must never enter investigation");

  const denyDemo = getRuntimeArchitectureDemoRoute("deny");
  assert(denyDemo.activeBranch === "rejected", `DENY demo should activate rejected route, got ${denyDemo.activeBranch}`);
  assert(denyDemo.toolExecutes === false, "DENY demo must not execute protected tool path");
  assert(
    denyDemo.waypoints.join(">") === "devfix>request>contract>context>cedar>rejected>evidence>hash>investigation",
    `DENY demo route should terminate at investigation, got ${denyDemo.waypoints.join(">")}`
  );
  assert(!denyDemo.waypoints.includes("decision"), "DENY demo must not pass through the decision gate");
  assert(!denyDemo.waypoints.includes("tool"), "DENY demo must never enter protected tool");
}

function testRoutesAreDerivedFromCedarDecision() {
  const allow = getRuntimeArchitectureRouteForDecision("ALLOW");
  assert(
    allow.waypoints.join(">") === "devfix>request>contract>context>cedar>approved>decision>tool",
    `Cedar ALLOW decision should produce approved route, got ${allow.waypoints.join(">")}`
  );

  const deny = getRuntimeArchitectureRouteForDecision("DENY");
  assert(
    deny.waypoints.join(">") === "devfix>request>contract>context>cedar>rejected>evidence>hash>investigation",
    `Cedar DENY decision should produce rejected route, got ${deny.waypoints.join(">")}`
  );
}

function testNoAllowDenyReconnectionRail() {
  const railKeys = new Set(RUNTIME_ARCHITECTURE_RAILS.map((rail) => `${rail.from}->${rail.to}`));
  assert(!railKeys.has("tool->evidence"), "ALLOW/protected-tool branch must not reconnect to evidence");
  assert(!railKeys.has("evidence->tool"), "Audit branch must not reconnect to protected tool");
  assert(railKeys.has("rejected->evidence"), "DENY branch should continue to evidence");
}

function testPhysicalYBranchSeparation() {
  const byId = new Map(RUNTIME_ARCHITECTURE_NODES.map((node) => [node.id, node]));
  const approvedZ = byId.get("tool")!.position[2];
  const evidenceZ = byId.get("evidence")!.position[2];
  const hashZ = byId.get("hash")!.position[2];
  const investigationZ = byId.get("investigation")!.position[2];

  assert(approvedZ < 0, "Approved terminal should live on the approved branch");
  assert(evidenceZ > 0, "Evidence should live on the denied/audit branch");
  assert(hashZ === evidenceZ, "Hash should remain physically aligned with the denied/audit branch");
  assert(investigationZ === evidenceZ, "Investigation should remain physically aligned with the denied/audit branch");
}

function testDemoModeInteractionContract() {
  assert(RUNTIME_INTERACTION_MODEL.demoModes.includes("ALLOW DEMO"), "Missing ALLOW demo interaction mode");
  assert(RUNTIME_INTERACTION_MODEL.demoModes.includes("DENY / ERROR DEMO"), "Missing DENY / ERROR demo interaction mode");
  assert(RUNTIME_INTERACTION_MODEL.replayControl === "REPLAY DEMO", "Runtime architecture should expose a replay control");
  assert(RUNTIME_INTERACTION_MODEL.liveEventData === "displayed separately from demo mode", "Live event data should stay separate from demo state");
  assert(
    RUNTIME_INTERACTION_MODEL.runtimeDecisionPoint === "Cedar produces ALLOW or DENY after the request reaches Cedar",
    "Cedar should be modeled as the runtime decision point"
  );
  assert(
    RUNTIME_INTERACTION_MODEL.fullViewBehavior === "architecture camera only; runtime route remains selected demo route",
    "Full View should not alter runtime routing"
  );
}

function testInspectorUsesOnlyEventData() {
  const event = {
    id: "evt_test",
    eventId: "evt_test",
    timestamp: "2026-09-19T08:00:00.000Z",
    sessionId: "sess_test",
    agentId: "DevFix",
    action: "fs:read",
    resource: ".env",
    trust: "UNTRUSTED_EXTERNAL",
    decision: "DENY",
    reason: "AUTHORITY_DRIFT",
    authProvider: "local-cedar",
    execution: "NOT_EXECUTED",
    curr: "abc123",
    prev: "genesis",
    seq: 4,
  };

  const cedar = buildRuntimeArchitectureInspector("cedar", event, { verified: true, ok: 4, total: 4 }, null);
  const cedarLabels = cedar.rows.map((row) => row.label);
  for (const label of ["Principal", "Action", "Resource", "Context", "Decision", "Provider"]) {
    assert(cedarLabels.includes(label), `Cedar inspector missing ${label}`);
  }
  assert(!cedarLabels.includes("Latency"), "Inspector must not fabricate latency");
  assert(!cedarLabels.includes("Policy Version"), "Inspector must not fabricate policy version");

  const tool = buildRuntimeArchitectureInspector("tool", event, { verified: true, ok: 4, total: 4 }, null);
  assert(
    tool.rows.some((row) => row.label === "Execution" && row.value === "NOT_EXECUTED"),
    "Tool inspector should expose real execution state"
  );

  const hash = buildRuntimeArchitectureInspector("hash", event, { verified: true, ok: 4, total: 4 }, null);
  assert(
    hash.rows.some((row) => row.label === "Current hash" && row.value === "abc123"),
    "Hash inspector should expose current event hash"
  );
  assert(
    hash.rows.some((row) => row.label === "Verification" && row.value === "verified"),
    "Hash inspector should expose existing verification state"
  );
}

function testSecondPassVisualContract() {
  assert(RUNTIME_VISUAL_DETAIL.palette.machineShell === "off-white", "Machine shell should use a light premium material direction");
  assert(RUNTIME_VISUAL_DETAIL.palette.stage === "dark-dashboard", "Scene should remain inside the dark dashboard stage");

  const cedar = RUNTIME_VISUAL_DETAIL.modules.cedar;
  assert(cedar.minimumParts > RUNTIME_VISUAL_DETAIL.modules.decision.minimumParts, "Cedar must be more detailed than the decision gate");
  assert(cedar.minimumParts > RUNTIME_VISUAL_DETAIL.modules.tool.minimumParts, "Cedar must be more detailed than the protected tool");
  for (const part of ["outer housing", "transparent inspection window", "authorization core", "mechanical rings", "leader lines"]) {
    assert(cedar.parts.includes(part), `Cedar visual contract missing ${part}`);
  }

  for (const label of ["CEDAR AUTHORIZATION CORE", "DECISION GATE", "CONTEXT / PROVENANCE", "PROTECTED TOOL", "EVIDENCE RECORD", "SHA-256 CHAIN"]) {
    assert(RUNTIME_VISUAL_DETAIL.inspectionLabels.includes(label), `Missing inspection label ${label}`);
  }
}

function testNodeSpecificInspectors() {
  const event = {
    id: "evt_node",
    eventId: "evt_node",
    timestamp: "2026-09-19T08:00:00.000Z",
    sessionId: "A91F2",
    agentId: "devfix",
    action: "fs:read",
    resource: "node_modules/axios/README.md",
    trust: "UNTRUSTED_EXTERNAL",
    decision: "ALLOW",
    reason: "WITHIN_CONTRACT_SCOPE",
    authProvider: "local-cedar",
    execution: "EXECUTED",
    curr: "currhash",
    prev: "prevhash",
    seq: 5,
  };

  const devfix = buildRuntimeArchitectureInspector("devfix", event, { verified: true, ok: 6, total: 6 }, null);
  assert(devfix.rows.some((row) => row.label === "Session" && row.value === "A91F2"), "DevFix inspector should show session");
  assert(devfix.rows.some((row) => row.label === "Current state"), "DevFix inspector should show current state");

  const contract = buildRuntimeArchitectureInspector("contract", event, { verified: true, ok: 6, total: 6 }, null);
  for (const label of ["Contract ID", "Filesystem scope", "Network scope", "Tool scope", "Approval"]) {
    assert(contract.rows.some((row) => row.label === label), `Contract inspector missing ${label}`);
  }

  const context = buildRuntimeArchitectureInspector("context", event, { verified: true, ok: 6, total: 6 }, null);
  assert(context.rows.some((row) => row.label === "Classification" && row.value === "UNTRUSTED_EXTERNAL"), "Context inspector should show trust classification");
  assert(
    context.rows.some((row) => row.label === "Meaning" && row.value.includes("origin")),
    "Context inspector should avoid equating untrusted origin with maliciousness"
  );

  const investigation = buildRuntimeArchitectureInspector(
    "investigation",
    event,
    { verified: true, ok: 6, total: 6 },
    { generatedBy: "Amazon Bedrock", refs: ["evt_node"], basis: ["recorded evidence"], whatHappened: ["Post-hoc review complete"] }
  );
  assert(investigation.rows.some((row) => row.label === "Mode" && row.value === "POST-HOC"), "Investigation should be labeled post-hoc");
  assert(!investigation.rows.some((row) => row.label === "Runtime authority"), "Investigation must not look like runtime authorization");
}

function testInteractionModelContract() {
  for (const control of ["ZOOM IN", "ZOOM OUT", "RESET VIEW", "FULL VIEW"]) {
    assert(RUNTIME_INTERACTION_MODEL.cameraControls.includes(control), `Missing visible camera control ${control}`);
  }
  assert(RUNTIME_INTERACTION_MODEL.viewModes.includes("NORMAL"), "Missing normal view mode");
  assert(RUNTIME_INTERACTION_MODEL.viewModes.includes("FOCUSED"), "Missing focused view mode");
  assert(RUNTIME_INTERACTION_MODEL.viewModes.includes("FULL"), "Missing full view mode");
  assert(RUNTIME_INTERACTION_MODEL.viewModes.includes("INSPECTION"), "Missing inspection view mode");
  assert(RUNTIME_INTERACTION_MODEL.selectionWorkspace.left === "semantic inspector", "Selection should open semantic inspector on the left");
  assert(RUNTIME_INTERACTION_MODEL.selectionWorkspace.right === "main scene hero inspection", "Selection should keep inspection inside the main scene");
  assert(RUNTIME_INTERACTION_MODEL.sceneInstances === 1, "Runtime architecture must use exactly one Three.js scene");
  assert(RUNTIME_INTERACTION_MODEL.rendererInstances === 1, "Runtime architecture must use exactly one WebGL renderer");
  assert(RUNTIME_INTERACTION_MODEL.canvasInstances === 1, "Runtime architecture must use exactly one canvas");
  assert(RUNTIME_INTERACTION_MODEL.animationLoops === 1, "Runtime architecture must use exactly one animation loop");
  assert(RUNTIME_INTERACTION_MODEL.requestObject === "single physical ball", "Request should be represented as one physical ball");
  assert(RUNTIME_INTERACTION_MODEL.requestMotion === "single pass stops at endpoint", "Request ball should not loop after reaching route endpoint");
  for (const input of ["physical component click", "wheel zoom", "ctrl-wheel pinch zoom", "back to architecture"]) {
    assert(RUNTIME_INTERACTION_MODEL.inspectionNavigation.includes(input), `Missing inspection interaction ${input}`);
  }
  assert(
    RUNTIME_INTERACTION_MODEL.inspectionPlayback === "selected component slows demo without changing runtime route",
    "Inspection should slow playback without changing runtime routing"
  );
  assert(!RUNTIME_INTERACTION_MODEL.inspectionNavigation.includes("previous/next buttons"), "Previous/Next component navigation should be removed");
  assert(!RUNTIME_INTERACTION_MODEL.inspectionNavigation.includes("arrow keys"), "Arrow key component navigation should be removed");
  assert(!RUNTIME_INTERACTION_MODEL.inspectionNavigation.includes("horizontal swipe"), "Horizontal swipe component navigation should be removed");
}

function testInspectionNavigationOrder() {
  const expected = ["devfix", "request", "contract", "context", "cedar", "decision", "tool", "evidence", "hash", "investigation"];
  assert(
    RUNTIME_INSPECTION_NAVIGATION_ORDER.join(">") === expected.join(">"),
    `Inspection navigation order should follow primary pipeline, got ${RUNTIME_INSPECTION_NAVIGATION_ORDER.join(">")}`
  );
}

function testComponentExplanations() {
  for (const id of ["devfix", "request", "contract", "context", "cedar", "decision", "tool", "evidence", "hash", "investigation"]) {
    const explanation = RUNTIME_COMPONENT_EXPLANATIONS[id as keyof typeof RUNTIME_COMPONENT_EXPLANATIONS];
    assert(explanation, `Missing component explanation for ${id}`);
    for (const key of ["whatItDoes", "howItWorks", "runtimeRole", "securityBoundary", "relatedComponents"]) {
      assert((explanation as any)[key], `${id} explanation missing ${key}`);
    }
  }

  assert(
    RUNTIME_COMPONENT_EXPLANATIONS.context.howItWorks.includes("not an automatic claim of malicious intent"),
    "Context explanation must not equate provenance with maliciousness"
  );
  assert(RUNTIME_COMPONENT_EXPLANATIONS.cedar.runtimeRole === "Authorization authority", "Cedar should be the authorization authority");
  assert(
    RUNTIME_COMPONENT_EXPLANATIONS.investigation.runtimeRole === "Post-hoc investigation",
    "Investigation should be labeled post-hoc"
  );
  assert(
    RUNTIME_COMPONENT_EXPLANATIONS.investigation.securityBoundary.includes("ZERO RUNTIME AUTHORIZATION AUTHORITY"),
    "Investigation must explicitly communicate zero runtime authorization authority"
  );
}

testRuntimeTopology();
testDecisionRoutes();
testExplicitDemoRoutesAreIndependentFromLiveEventState();
testRoutesAreDerivedFromCedarDecision();
testNoAllowDenyReconnectionRail();
testPhysicalYBranchSeparation();
testInspectorUsesOnlyEventData();
testSecondPassVisualContract();
testNodeSpecificInspectors();
testInteractionModelContract();
testDemoModeInteractionContract();
testInspectionNavigationOrder();
testComponentExplanations();
console.log("Runtime architecture model tests passed.");
