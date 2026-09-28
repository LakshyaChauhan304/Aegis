const configuredApiBase = (import.meta as any).env?.VITE_AEGIS_API_BASE;
export const API_BASE = typeof configuredApiBase === "string" ? configuredApiBase.replace(/\/$/, "") : "";

export const TIMEOUT_MS = 2500;

export const ENDPOINTS = {
  health: () => `${API_BASE}/api/health`,
  invoke: () => `${API_BASE}/api/agent/invoke`,
  devfixRun: () => `${API_BASE}/api/devfix/run`,
  ledger: () => `${API_BASE}/api/agent/ledger`,
  verify: () => `${API_BASE}/api/agent/ledger/verify`,
  investigate: (eventId: string) => `${API_BASE}/api/agent/investigate/${encodeURIComponent(eventId)}`,
  status: () => `${API_BASE}/api/aegis/status`,
  policy: () => `${API_BASE}/api/aegis/policy`,
  capabilities: () => `${API_BASE}/api/aegis/capabilities`,
  contract: () => `${API_BASE}/api/aegis/contract`,
  history: () => `${API_BASE}/api/history`,
  scenariosRun: () => `${API_BASE}/api/scenarios/run`,
  reconstruct: (sessionId: string) => `${API_BASE}/api/agent/sessions/${encodeURIComponent(sessionId)}/reconstruct`,
};

const UNKNOWN = "UNKNOWN";

function authRequired(response: { status?: number }) {
  return response.status === 401 || response.status === 403;
}

function unavailable<T extends Record<string, any> = Record<string, never>>(
  r: { error?: string; status?: number },
  extra: T = {} as T,
): { source: "UNAVAILABLE"; reason?: string; authRequired: boolean } & T {
  return {
    source: "UNAVAILABLE",
    reason: r.error,
    authRequired: authRequired(r),
    ...extra,
  };
}

async function request(url: string, options?: RequestInit) {
  if (typeof fetch !== "function") {
    return { ok: false, error: "fetch unavailable in this environment" };
  }
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      ...(options || {}),
      ...(controller ? { signal: controller.signal } : {}),
    });
    const parsedData = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, status: res.status, data: parsedData };
    }
    return { ok: true, status: res.status, data: parsedData };
  } catch (e: any) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function elapsedSeconds(raw: any, firstTimestampMs: number | null) {
  if (typeof raw.t === "number") return raw.t;
  if (raw.tOffset != null && !Number.isNaN(Number(raw.tOffset))) return Number(raw.tOffset);
  if (raw.timestamp && firstTimestampMs != null) {
    const ms = Date.parse(raw.timestamp);
    if (!Number.isNaN(ms)) return (ms - firstTimestampMs) / 1000;
  }
  return 0;
}

export function normaliseEvent(raw: any, index: number, firstTimestampMs: number | null = null) {
  if (!raw || typeof raw !== "object") return null;
  const authorization = raw.authorization && typeof raw.authorization === "object" ? raw.authorization : {};
  return {
    eventType: raw.eventType || "AUTHORIZATION_EXECUTION",
    seq: raw.seq != null ? raw.seq : index + 1,
    id: raw.id || raw.eventId || `evt_${index}`,
    eventId: raw.eventId || raw.id || `evt_${index}`,
    timestamp: raw.timestamp || null,
    sessionId: raw.sessionId || null,
    agentId: raw.agentId || null,
    contractId: raw.contractId || null,
    t: elapsedSeconds(raw, firstTimestampMs),
    tool: raw.tool || raw.action || "",
    action: raw.action || "",
    resource: raw.resource || "",
    trust: raw.trust || raw.context?.trust || "INTERNAL", // Backend uses context.trust!
    decision: raw.decision || "",
    reason: raw.reason || "",
    authProvider: raw.authProvider || authorization.provider || UNKNOWN,
    policyStoreId: raw.policyStoreId || authorization.policyStoreId || null,
    authorizationError: authorization.error || null,
    execution: raw.execution || raw.executionState || UNKNOWN,
    bytes: typeof raw.bytes === "number" ? raw.bytes : typeof raw.bytesReturned === "number" ? raw.bytesReturned : null,
    http: raw.http != null ? raw.http : raw.httpStatus != null ? raw.httpStatus : null,
    prev: raw.prev || raw.previousHash || null,
    curr: raw.curr || raw.hash || raw.currentHash || null, // Backend uses hash
    archivalStatus: raw.archivalStatus || null,
    detail: raw.detail || "",
  };
}

function extractEvents(data: any) {
  const list = Array.isArray(data) ? data : Array.isArray(data && data.events) ? data.events : null;
  if (!list) return null;
  const firstTimestampMs = list.reduce((first: number | null, raw: any) => {
    if (!raw?.timestamp) return first;
    const ms = Date.parse(raw.timestamp);
    if (Number.isNaN(ms)) return first;
    return first == null ? ms : Math.min(first, ms);
  }, null);
  const mapped = list.map((raw: any, index: number) => normaliseEvent(raw, index, firstTimestampMs)).filter(Boolean);
  return mapped.length ? mapped : null;
}

export const aegisApi = {
  async getHistory() {
    const r = await request(ENDPOINTS.history());
    if (r.ok && r.data) {
      const events = extractEvents(r.data) || [];
      return { ...r.data, source: r.data.source || "LIVE", events };
    }
    return unavailable(r, { events: [], sessions: [], agents: [], decisions: [], recentActivity: [], totalEvents: 0 });
  },

  async runScenarios() {
    const r = await request(ENDPOINTS.scenariosRun(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({}),
    });
    if (r.ok && r.data) return { source: "LIVE", ...r.data };
    return unavailable(r, { status: "UNAVAILABLE", steps: [], scenarioCount: 0 });
  },

  async getContract() {
    const r = await request(ENDPOINTS.contract());
    if (r.ok && r.data) return { source: "LIVE", ...r.data };
    return unavailable(r, { contract: null, signature: "NOT_VERIFIED" });
  },

  async getLedger() {
    const r = await request(ENDPOINTS.ledger());
    if (r.ok) {
      const events = extractEvents(r.data);
      return { source: "LOCAL", events: events || [] };
    }
    return unavailable(r, { events: [] });
  },

  async verifyChain() {
    const r = await request(ENDPOINTS.verify());
    if (r.ok) {
      const d = r.data || {};
      return {
        source: "LOCAL",
        verified: !!d.valid, // Backend returns { valid: boolean }
        ok: typeof d.ok === "number" ? d.ok : (d.links && d.links.ok),
        total: typeof d.total === "number" ? d.total : (d.links && d.links.total),
      };
    }
    return unavailable(r, { verified: false, ok: 0, total: 0 });
  },

  async investigate(eventId: string) {
    const r = await request(ENDPOINTS.investigate(eventId));
    if (r.ok && r.data) {
      // Backend returns { event, investigationStatus: { status, analysis: string | object, error?: string } }
      const investigationStatus = r.data.investigationStatus || r.data;
      
      const analysisObj = typeof investigationStatus.analysis === 'object' ? investigationStatus.analysis : {
        whatHappened: [investigationStatus.analysis || investigationStatus.error || "Analysis failed"]
      };

      return {
        source: investigationStatus.status === "success" ? "LIVE_VERIFIED" : "SDK_READY",
        status: investigationStatus.status,
        error: investigationStatus.error,
        analysis: {
          generatedBy: analysisObj.generatedBy || "Amazon Bedrock",
          whatHappened: Array.isArray(analysisObj.whatHappened)
            ? analysisObj.whatHappened
            : analysisObj.narrative ? [analysisObj.narrative] : [investigationStatus.analysis || investigationStatus.error || "Analysis failed"],
          refs: analysisObj.refs || analysisObj.evidenceReferences || [],
          basis: analysisObj.basis || [],
          notAsserted: analysisObj.notAsserted || [],
        },
      };
    }
    if (!r.ok) {
      return {
        ...unavailable(r),
        status: "failed",
        error: r.error,
        analysis: {
          generatedBy: "Unavailable",
          whatHappened: [authRequired(r) ? "Authentication is required to investigate this event." : (r.data?.error || r.data?.reason || r.error || "Investigation backend is unavailable.")],
          refs: [],
          basis: [],
          notAsserted: [],
        },
      };
    }
    return unavailable(r, { status: "failed", analysis: { generatedBy: "Unavailable", whatHappened: [], refs: [], basis: [], notAsserted: [] } });
  },

  async getHealth() {
    const r = await request(ENDPOINTS.health());
    if (r.ok && r.data) return { source: "LOCAL", ...r.data };
    return unavailable(r, { status: "unavailable" });
  },

  async getStatus() {
    const r = await request(ENDPOINTS.status());
    if (r.ok && r.data) return { source: "LOCAL", ...r.data };
    return {
      ...unavailable(r),
      aws: [],
      securityCore: {
        pep: "UNAVAILABLE",
        cedar: "UNAVAILABLE",
        ledger: "UNAVAILABLE",
        protectedExecution: "UNAVAILABLE",
        note: "Backend status endpoint is unavailable; no protected status data is shown.",
      },
    };
  },

  async getPolicy() {
    const r = await request(ENDPOINTS.policy());
    if (r.ok && r.data) return { source: "LOCAL", ...r.data };
    if (!r.ok) {
      return {
        ...unavailable(r),
        file: "policy unavailable",
        hashAlgorithm: "SHA-256",
        hash: "",
        sourceText: "",
      };
    }
    return unavailable(r, { file: "policy unavailable", hashAlgorithm: "SHA-256", hash: "", sourceText: "" });
  },

  async getCapabilities() {
    const r = await request(ENDPOINTS.capabilities());
    if (r.ok && r.data) return { source: "LOCAL", ...r.data };
    return unavailable(r, { runtimeTools: [] });
  },

  async reconstruct(sessionId: string) {
    const r = await request(ENDPOINTS.reconstruct(sessionId));
    if (r.ok && r.data) return { source: "LOCAL", ...r.data };
    return unavailable(r, { sessionId, events: [], verification: { valid: false, scope: "unavailable", eventCount: 0 } });
  },

  async invoke(toolOrBody: any, action?: string, resource?: string, trust?: string): Promise<any> {
    let body = toolOrBody;
    if (typeof toolOrBody === "string") {
      body = {
        sessionId: "sess_ui_" + Date.now(),
        agentId: "DevFix",
        contractId: "tc_devfix_dependency_remediation_v1",
        tool: toolOrBody,
        action: action || "fs:read",
        resource: resource || "package.json",
        context: { trust: trust || "TRUSTED" }
      };
    }
    const r = await request(ENDPOINTS.invoke(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body || {}),
    });
    const payload = r.data || {};
    const decision = payload.decision;
    const resultText = typeof payload.result === "string" ? payload.result : null;
    const byteCount =
      typeof payload.bytesReturned === "number"
        ? payload.bytesReturned
        : resultText != null
          ? new TextEncoder().encode(resultText).length
          : typeof payload.error === "string"
            ? 0
            : null;
    const executionState =
      payload.executionState ||
      (decision?.decision === "DENY" ? "NOT_EXECUTED" : resultText != null ? "EXECUTED" : UNKNOWN);
    return {
      source: r.ok ? "LOCAL" : "UNAVAILABLE",
      status: r.status || (r.ok ? 200 : 500),
      ok: r.ok,
      result: resultText,
      error: payload.error || r.error,
      decision,
      eventId: decision?.eventId || payload.eventId || null,
      reason: decision?.reason || null,
      authProvider: decision?.authorization?.provider || UNKNOWN,
      trust: body?.context?.trust || UNKNOWN,
      tool: body?.tool,
      action: body?.action,
      resource: body?.resource,
      executionState,
      bytesReturned: byteCount,
      archivalStatus: decision?.archivalStatus || null,
      ...(authRequired(r) ? { authRequired: true } : {}),
    };
  },

  async runDevFix(contractId = "tc_devfix_dependency_remediation_v1") {
    const r = await request(ENDPOINTS.devfixRun(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ contractId }),
    });
    if (r.ok && r.data) return { source: "LOCAL", ...r.data };
    return unavailable(r, { sessionId: null, agentId: "DevFix", contractId, status: "UNAVAILABLE", steps: [] });
  },
};

export default aegisApi;
