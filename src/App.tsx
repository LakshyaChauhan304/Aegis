import React, { useState, useEffect, useRef } from "react";
import AppShell from "./components/layout/AppShell.tsx";
import Overview from "./components/overview/Overview.tsx";
import Agents from "./components/agents/Agents.tsx";
import Execution from "./components/execution/Execution.tsx";
import Contracts from "./components/contracts/Contracts.tsx";
import Policies from "./components/policies/Policies.tsx";
import Decisions from "./components/decisions/Decisions.tsx";
import Sessions from "./components/sessions/Sessions.tsx";
import Evidence from "./components/evidence/Evidence.tsx";
import FlightRecorder from "./components/recorder/FlightRecorder.tsx";
import LineageVisual from "./components/lineage/LineageVisual.tsx";
import Investigations from "./components/investigations/Investigations.tsx";
import SecurityTests from "./components/tests/SecurityTests.tsx";
import AwsControlPlane from "./components/aws/AwsControlPlane.tsx";
import Onboarding from "./components/onboarding/Onboarding.tsx";
import aegisApi from "./data/aegisApi.ts";
import { parseHash, ROUTE_IDS, ROUTE_LABELS } from "./components/layout/routes.ts";

export default function App() {
  const [route, setRouteState] = useState(parseHash(window.location.hash));
  const [data, setData] = useState<any>({ source: "UNAVAILABLE", events: [] });
  const [chain, setChain] = useState<any>({ source: "UNAVAILABLE", verified: false, ok: 0, total: 0 });
  const [analysis, setAnalysis] = useState<any>({
    source: "UNAVAILABLE",
    analysis: {
      generatedBy: "Not run",
      whatHappened: ["Select a recorded event and run a post-hoc investigation to invoke Bedrock."],
      basis: [],
      refs: [],
      notAsserted: ["No Bedrock analysis has been run for this view."],
    }
  });
  const [playIdx, setPlayIdx] = useState(0);
  const [selectedEvent, selectEvent] = useState<any>(null);
  const [activeRun, setActiveRun] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);
  const [contract, setContract] = useState<any>(null);
  const liveRunGeneration = useRef(0);

  const setRoute = (r: string) => {
    window.location.hash = r;
    setRouteState(r);
  };

  useEffect(() => {
    const onHash = () => setRouteState(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.title = (ROUTE_LABELS[route] || "Overview") + " · Aegis";
  }, [route]);

  const refreshLedger = async () => {
    const persisted = await aegisApi.getHistory();
    if (persisted.source === "LIVE") {
      const events = persisted.events || [];
      setHistory(persisted);
      setData({ source: "LIVE", events });
      setChain({ source: "LIVE", verified: false, ok: null, total: events.length });
      setPlayIdx(Math.max(0, events.length - 1));
      if (events.length) selectEvent(events[events.length - 1].id);
      return;
    }
    const [ledgerRes, chainRes] = await Promise.all([
      aegisApi.getLedger(),
      aegisApi.verifyChain()
    ]);
    const liveEvents = (ledgerRes.events || []).filter((event: any) => event.eventType === "AUTHORIZATION_EXECUTION");
    setData({ ...ledgerRes, events: liveEvents });
    setChain(chainRes);
    const evs = liveEvents;
    setPlayIdx(Math.max(0, evs.length - 1));
    if (evs.length) {
      selectEvent(evs[evs.length - 1].id);
    }
  };

  const runDevFix = async () => {
    liveRunGeneration.current += 1;
    const run = await aegisApi.runDevFix();
    if (run.source === "UNAVAILABLE" || !run.sessionId || !Array.isArray(run.steps)) {
      throw new Error(run.reason || "DevFix backend is unavailable");
    }

    const [historyRes, ledgerRes, chainRes] = await Promise.all([
      aegisApi.getHistory(),
      aegisApi.getLedger(),
      aegisApi.verifyChain(),
    ]);
    if (historyRes.source === "LIVE" && historyRes.events?.length) setHistory(historyRes);
    const ledgerEvents = ((historyRes.source === "LIVE" ? historyRes.events : ledgerRes.events) || []).filter((event: any) =>
      event.eventType === "AUTHORIZATION_EXECUTION" && event.sessionId === run.sessionId
    );
    const hasLedgerEvidence = ledgerEvents.length === run.steps.length;
    const evidenceSource = hasLedgerEvidence ? "LIVE" : "DERIVED";
    const events = hasLedgerEvidence
      ? ledgerEvents
      : run.steps.map((step: any, index: number) => ({
        seq: index + 1,
        id: step.eventId,
        eventId: step.eventId,
        t: index,
        tool: step.tool,
        action: step.action,
        resource: step.resource,
        trust: step.trust,
        decision: step.decision,
        reason: step.reason || "NOT AVAILABLE",
        execution: step.executionState,
        bytes: step.bytes,
        sessionId: run.sessionId,
        agentId: run.agentId,
        contractId: run.contractId,
      }));

    setActiveRun({ ...run, events, evidenceSource });
    setData({ source: evidenceSource, events });
    setChain(hasLedgerEvidence ? chainRes : { source: "UNAVAILABLE", verified: false, ok: null, total: null });
    setPlayIdx(Math.max(0, events.length - 1));
    const finalEvent = events[events.length - 1];
    selectEvent(finalEvent?.id || null);
    setAnalysis({
      source: "UNAVAILABLE",
      analysis: {
        generatedBy: "Not run",
        whatHappened: ["Select the recorded event and run a post-hoc investigation to invoke Bedrock."],
        basis: [],
        refs: [],
        notAsserted: ["No Bedrock analysis has been run for this live run."],
      },
    });
    return { ...run, events };
  };

  const runScenarioSuite = async () => {
    const result = await aegisApi.runScenarios();
    if (result.source === "UNAVAILABLE") throw new Error(result.reason || "Scenario suite unavailable");
    const events = (result.steps || []).map((step: any, index: number) => ({
      seq: index + 1,
      id: step.eventId,
      eventId: step.eventId,
      timestamp: null,
      t: index,
      tool: step.tool,
      action: step.action,
      resource: step.resource,
      trust: step.trust,
      decision: step.decision,
      reason: step.reason,
      execution: step.executionState,
      bytes: step.bytes,
      sessionId: step.sessionId,
      agentId: step.agentId,
      contractId: step.contractId,
      authProvider: step.authorizationProvider,
      archivalStatus: step.archivalStatus,
    }));
    setActiveRun({ ...result, events, evidenceSource: "DERIVED" });
    setData({ source: "DERIVED", events });
    setChain({ source: "UNAVAILABLE", verified: false, ok: null, total: null });
    setPlayIdx(Math.max(0, events.length - 1));
    selectEvent(events[events.length - 1]?.id || null);
    await refreshLedger();
    return { ...result, events };
  };

  useEffect(() => {
    let active = true;
    const requestGeneration = liveRunGeneration.current;
    aegisApi.getHistory().then((historyRes) => {
      if (!active || requestGeneration !== liveRunGeneration.current) return;
      if (historyRes.source === "LIVE") {
        setHistory(historyRes);
        setData({ source: "LIVE", events: historyRes.events || [] });
        setChain({ source: "LIVE", verified: false, ok: null, total: (historyRes.events || []).length });
      } else return;
      const evs = historyRes.events || [];
      setPlayIdx(Math.max(0, evs.length - 1));
      if (evs.length) {
        selectEvent(evs[evs.length - 1].id);
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    aegisApi.getContract().then((result) => {
      if (result.source === "LIVE" && result.contract) setContract(result.contract);
    });
  }, []);

  const Component = {
    onboarding: Onboarding,
    overview: Overview,
    agents: Agents,
    execution: Execution,
    contracts: Contracts,
    policies: Policies,
    decisions: Decisions,
    sessions: Sessions,
    evidence: Evidence,
    recorder: FlightRecorder,
    lineage: LineageVisual,
    investigations: Investigations,
    tests: SecurityTests,
    aws: AwsControlPlane,
  }[route as keyof typeof ROUTE_LABELS] || Overview;

  if (route === "onboarding") {
    return <Onboarding go={setRoute} />;
  }

  const currentRun = activeRun || (history?.events?.length ? {
    sessionId: history.events[history.events.length - 1]?.sessionId,
    agentId: history.events[history.events.length - 1]?.agentId,
    contractId: history.events[history.events.length - 1]?.contractId,
    status: "HISTORY",
  } : null);

  return (
    <AppShell
      route={route}
      setRoute={setRoute}
      events={data.events}
      playIdx={playIdx}
      setPlayIdx={setPlayIdx}
      selectedEvent={selectedEvent}
      selectEvent={selectEvent}
      activeRun={currentRun}>
      <Component
        events={data.events}
        idx={playIdx}
        setIdx={setPlayIdx}
        selected={selectedEvent}
        select={selectEvent}
        go={setRoute}
        source={data.source}
        chain={chain}
        refresh={refreshLedger}
        activeRun={currentRun}
        onDevFixRun={runDevFix}
        onScenarioRun={runScenarioSuite}
        contract={contract}
        analysis={analysis.analysis}
        analysisSource={analysis.source}
        setAnalysis={setAnalysis}
      />
    </AppShell>
  );
}
