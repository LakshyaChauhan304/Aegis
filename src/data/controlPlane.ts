import { CONTRACT, EVENTS, SESSION } from "./fixtures.js";

type SourceKind = "LIVE" | "LOCAL" | "PARTIAL" | "FIXTURE" | "UNAVAILABLE" | "SDK_READY" | "LIVE_VERIFIED" | string;

export type ControlPlaneSession = {
  id: string;
  agentId: string;
  contractId: string;
  startedAt: string | null;
  durationMs: number | null;
  events: any[];
  allowCount: number;
  denyCount: number;
  untrustedInputCount: number;
  state: string;
  source: "FIXTURE" | "LIVE" | "DERIVED";
};

export type ControlPlaneAgent = {
  id: string;
  name: string;
  role: string;
  sessionIds: string[];
  contractIds: string[];
  allowCount: number;
  denyCount: number;
  untrustedInputCount: number;
  recentEvents: any[];
  source: "FIXTURE" | "LIVE" | "DERIVED";
};

export function controlPlaneSourceLabel(source: SourceKind) {
  if (source === "LOCAL" || source === "LIVE_VERIFIED") return "LIVE";
  if (source === "SDK_READY") return "NOT VERIFIED";
  return source || "NOT AVAILABLE";
}

export function eventTraceId(event: any) {
  return event?.id || event?.eventId || "NOT AVAILABLE";
}

export function getEventById(events: any[], id: string | null | undefined) {
  if (!id) return null;
  return (Array.isArray(events) ? events : []).find((event) => event?.id === id || event?.eventId === id) || null;
}

function eventTimeMs(event: any) {
  if (!event?.timestamp) return null;
  const ms = Date.parse(event.timestamp);
  return Number.isNaN(ms) ? null : ms;
}

function fallbackSessionId(source: SourceKind) {
  return source === "FIXTURE" ? SESSION.id : "UNKNOWN_SESSION";
}

function fallbackAgentId(source: SourceKind) {
  return source === "FIXTURE" ? SESSION.agentId : "UNKNOWN_AGENT";
}

export function buildControlPlaneSessions(events: any[] = EVENTS, source: SourceKind = "FIXTURE"): ControlPlaneSession[] {
  const safeEvents = Array.isArray(events) && events.length ? events : source === "FIXTURE" ? EVENTS : [];
  const isFixture = source === "FIXTURE";
  const grouped = safeEvents.reduce((acc: Record<string, any>, event: any) => {
    const sessionId = event.sessionId || fallbackSessionId(source);
    if (!acc[sessionId]) {
      acc[sessionId] = {
        id: sessionId,
        agentId: event.agentId || fallbackAgentId(source),
        contractId: event.contractId || (isFixture ? SESSION.contractId : "NOT AVAILABLE"),
        startedAt: event.timestamp || (isFixture ? SESSION.startedAt : null),
        durationMs: isFixture ? SESSION.durationMs : null,
        events: [],
        source: isFixture ? "FIXTURE" : source === "LIVE" ? "LIVE" : "DERIVED",
      };
    }
    acc[sessionId].events.push(event);
    const current = eventTimeMs(event);
    const previous = eventTimeMs({ timestamp: acc[sessionId].startedAt });
    if (current != null && (previous == null || current < previous)) {
      acc[sessionId].startedAt = event.timestamp;
    }
    return acc;
  }, {});

  return Object.values(grouped).map((row: any) => {
    const allowCount = row.events.filter((event: any) => event.decision === "ALLOW").length;
    const denyCount = row.events.filter((event: any) => event.decision === "DENY").length;
    const untrustedInputCount = row.events.filter((event: any) => event.trust === "UNTRUSTED_EXTERNAL").length;
    return {
      ...row,
      allowCount,
      denyCount,
      untrustedInputCount,
      state: denyCount ? (source === "LIVE" ? "COMPLETED" : "HALTED_AT_DENY") : isFixture ? SESSION.state : "LOCAL",
    };
  });
}

export function buildControlPlaneAgent(events: any[] = EVENTS, source: SourceKind = "FIXTURE"): ControlPlaneAgent {
  const safeEvents = Array.isArray(events) && events.length ? events : source === "FIXTURE" ? EVENTS : [];
  const isFixture = source === "FIXTURE";
  const sessions = buildControlPlaneSessions(safeEvents, source);
  const allowCount = safeEvents.filter((event) => event.decision === "ALLOW").length;
  const denyCount = safeEvents.filter((event) => event.decision === "DENY").length;
  const untrustedInputCount = safeEvents.filter((event) => event.trust === "UNTRUSTED_EXTERNAL").length;
  const agentId = isFixture ? SESSION.agentId : safeEvents.find((event) => event.agentId)?.agentId || "NOT AVAILABLE";

  return {
    id: agentId,
    name: isFixture ? SESSION.agentName : agentId,
    role: isFixture ? SESSION.agentRole : source === "LIVE" ? "Dependency Remediation Agent" : "NOT AVAILABLE",
    sessionIds: sessions.map((session) => session.id).filter((id) => id !== "UNKNOWN_SESSION"),
    contractIds: isFixture ? [CONTRACT.id] : Array.from(new Set(safeEvents.map((event) => event.contractId).filter(Boolean))),
    allowCount,
    denyCount,
    untrustedInputCount,
    recentEvents: safeEvents.slice(-4).reverse(),
    source: isFixture ? "FIXTURE" : source === "LIVE" ? "LIVE" : "DERIVED",
  };
}

export function buildControlPlaneModel(events: any[] = EVENTS, source: SourceKind = "FIXTURE") {
  const safeEvents = Array.isArray(events) && events.length ? events : source === "FIXTURE" ? EVENTS : [];
  return {
    source,
    displaySource: controlPlaneSourceLabel(source),
    agent: buildControlPlaneAgent(safeEvents, source),
    sessions: buildControlPlaneSessions(safeEvents, source),
    events: safeEvents,
  };
}
