import React, { useState, useEffect } from "react";
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
import { EVENTS } from "./data/fixtures.js";
import { parseHash, ROUTE_IDS, ROUTE_LABELS } from "./components/layout/routes.ts";

export default function App() {
  const [route, setRouteState] = useState(parseHash(window.location.hash));
  const [data, setData] = useState<any>({ source: "FIXTURE", events: EVENTS });
  const [chain, setChain] = useState<any>({ source: "FIXTURE", verified: true, ok: EVENTS.length, total: EVENTS.length });
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
  const [playIdx, setPlayIdx] = useState(EVENTS.length - 1);
  const [selectedEvent, selectEvent] = useState<any>(EVENTS[EVENTS.length - 1]?.id || null);
  const [activeRun, setActiveRun] = useState<any>(null);

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
    const [ledgerRes, chainRes] = await Promise.all([
      aegisApi.getLedger(),
      aegisApi.verifyChain()
    ]);
    setData(ledgerRes);
    setChain(chainRes);
    const evs = ledgerRes.events || [];
    setPlayIdx(Math.max(0, evs.length - 1));
    if (evs.length) {
      selectEvent(evs[evs.length - 1].id);
    }
  };

  const runDevFix = async () => {
    const run = await aegisApi.runDevFix();
    if (run.source === "UNAVAILABLE" || !run.sessionId || !Array.isArray(run.steps)) {
      throw new Error(run.reason || "DevFix backend is unavailable");
    }

    const [ledgerRes, chainRes] = await Promise.all([
      aegisApi.getLedger(),
      aegisApi.verifyChain(),
    ]);
    const ledgerEvents = (ledgerRes.events || []).filter((event: any) =>
      event.eventType === "AUTHORIZATION_EXECUTION" && event.sessionId === run.sessionId
    );
    const events = ledgerEvents.length === run.steps.length
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

    setActiveRun({ ...run, events });
    setData({ source: "LIVE", events });
    setChain(ledgerEvents.length === run.steps.length ? chainRes : { source: "UNAVAILABLE", verified: false, ok: null, total: null });
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

  useEffect(() => {
    let active = true;
    Promise.all([
      aegisApi.getLedger(),
      aegisApi.verifyChain()
    ]).then(([ledgerRes, chainRes]) => {
      if (!active) return;
      setData(ledgerRes);
      setChain(chainRes);
      const evs = ledgerRes.events || [];
      setPlayIdx(Math.max(0, evs.length - 1));
      if (evs.length) {
        selectEvent(evs[evs.length - 1].id);
      }
    });
    return () => { active = false; };
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

  return (
    <AppShell
      route={route}
      setRoute={setRoute}
      events={data.events}
      playIdx={playIdx}
      setPlayIdx={setPlayIdx}
      selectedEvent={selectedEvent}
      selectEvent={selectEvent}
      activeRun={activeRun}>
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
        activeRun={activeRun}
        onDevFixRun={runDevFix}
        analysis={analysis.analysis}
        analysisSource={analysis.source}
        setAnalysis={setAnalysis}
      />
    </AppShell>
  );
}
