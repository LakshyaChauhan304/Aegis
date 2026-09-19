import {
  buildControlPlaneModel,
  controlPlaneSourceLabel,
  eventTraceId,
  getEventById,
} from "../src/data/controlPlane.ts";
import { CONTRACT, EVENTS, SESSION } from "../src/data/fixtures.js";

function assert(condition: any, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testFixtureReferenceScenarioModel() {
  const model = buildControlPlaneModel(EVENTS, "FIXTURE");
  assert(model.agent.id === SESSION.agentId, "Fixture agent id should come from SESSION");
  assert(model.agent.sessionIds.includes(SESSION.id), "Fixture agent should expose A91F2 session");
  assert(model.agent.contractIds.includes(CONTRACT.id), "Fixture agent should expose reference contract");
  assert(model.agent.allowCount === 3, `Expected 3 ALLOW events, got ${model.agent.allowCount}`);
  assert(model.agent.denyCount === 1, `Expected 1 DENY event, got ${model.agent.denyCount}`);
  assert(model.agent.untrustedInputCount === 2, `Expected 2 untrusted inputs, got ${model.agent.untrustedInputCount}`);

  const session = model.sessions.find((row) => row.id === SESSION.id);
  assert(session, "Expected reference session row");
  assert(session.events.length === EVENTS.length, "Fixture session should contain all fixture events");
  assert(session.source === "FIXTURE", "Fixture session should be labeled fixture");
}

function testLiveDerivedSessionModelDoesNotInventContract() {
  const liveEvents = [
    {
      id: "evt_live_1",
      eventId: "evt_live_1",
      timestamp: "2026-09-20T01:00:00.000Z",
      sessionId: "sess_live",
      agentId: "DevFix",
      action: "fs:read",
      tool: "fs",
      resource: "package.json",
      trust: "TRUSTED",
      decision: "ALLOW",
      reason: "Authorized",
      execution: "EXECUTED",
      bytes: 42,
      prev: "GENESIS",
      curr: "hash_live_1",
    },
  ];
  const model = buildControlPlaneModel(liveEvents, "LOCAL");
  assert(model.sessions[0].contractId === "NOT AVAILABLE", "Live sessions must not invent a contract id");
  assert(model.sessions[0].source === "DERIVED", "Live sessions should be labeled frontend-derived");
  assert(model.agent.contractIds.length === 0, "Live agent summary should not expose fixture contract ids");
}

function testTraceHelpers() {
  assert(eventTraceId(EVENTS[0]) === EVENTS[0].id, "Trace id should prefer existing id");
  assert(getEventById(EVENTS, EVENTS[2].id)?.id === EVENTS[2].id, "Should find events by id");
  assert(getEventById(EVENTS, "missing") == null, "Missing events should return null");
  assert(controlPlaneSourceLabel("LOCAL") === "LIVE", "LOCAL source should display as LIVE");
  assert(controlPlaneSourceLabel("FIXTURE") === "FIXTURE", "Fixture source should remain fixture");
}

testFixtureReferenceScenarioModel();
testLiveDerivedSessionModelDoesNotInventContract();
testTraceHelpers();
console.log("Control plane model tests passed.");
