import React, { useState } from "react";
import PageHead from "../shared/PageHead.tsx";
import Panel from "../shared/Panel.tsx";
import Verdict from "./Verdict.tsx";
import ScopePanel from "./ScopePanel.tsx";
import ActivityStream from "./ActivityStream.tsx";
import ProvenancePanel from "./ProvenancePanel.tsx";
import BoundaryVisual from "../viz/BoundaryVisual.tsx";
import HeroProofPipeline from "./HeroProofPipeline.tsx";
import aegisApi from "../../data/aegisApi.ts";
import { SESSION } from "../../data/fixtures.js";

export default function Execution({ events, idx, go, select, refresh }: any) {
  const visible = events.slice(0, idx + 1);
  const denied = visible.find((e: any) => e.decision === "DENY");
  const untrusted = visible.find((e: any) => e.trust === "UNTRUSTED_EXTERNAL");
  const touched = new Set(visible.map((e: any) => e.resource));

  const [runningHero, setRunningHero] = useState(false);
  const [heroStatus, setHeroStatus] = useState<string | null>(null);
  const [heroResults, setHeroResults] = useState<any[]>([]);

  const runLiveHeroFlow = async () => {
    setRunningHero(true);
    setHeroResults([]);
    const steps = [
      { label: "package.json", resource: "package.json", trust: "TRUSTED" },
      { label: "package-lock.json", resource: "package-lock.json", trust: "TRUSTED" },
      { label: "axios README", resource: "node_modules/axios/README.md", trust: "UNTRUSTED_EXTERNAL" },
      { label: ".env", resource: ".env", trust: "UNTRUSTED_EXTERNAL" },
    ];

    try {
      for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i];
        setHeroStatus(`Evaluating Step ${i + 1}/4 at Aegis PEP: ${step.label}...`);
        const response = await aegisApi.invoke("fs", "fs:read", step.resource, step.trust);
        setHeroResults((prev) => [...prev, { ...step, ...response }]);
        if (refresh) await refresh();
      }

      setHeroStatus("Canonical hero verification complete. All events recorded into cryptographic SHA-256 ledger.");
    } catch (e: any) {
      setHeroStatus(`Execution note: ${e.message}`);
    } finally {
      setRunningHero(false);
    }
  };

  return (
    <>
      <PageHead
        title="Agent Execution"
        desc="Aegis sits between autonomous agent DevFix and protected tools. All actions are deterministically evaluated by Cedar policies at the Policy Enforcement Point (PEP)."
        actions={
          <>
            <button
              className="btn btn-hero-run primary"
              onClick={runLiveHeroFlow}
              disabled={runningHero}>
              {runningHero ? (heroStatus || "Evaluating PEP Boundary...") : "▶ Run Live Hero Flow"}
            </button>
            <button className="btn" onClick={() => go("contracts")}>Task Contract</button>
            <button className="btn" onClick={() => go("evidence")}>Evidence Ledger</button>
            <button className="btn" onClick={() => go("recorder")}>Flight Recorder</button>
          </>
        }
      />

      {/* Live Hero Execution Progress Banner */}
      {heroStatus && (
        <div className="hero-status-strip mono">
          <span className="pulse-indicator" />
          <span>{heroStatus}</span>
        </div>
      )}

      {/* Hero 4-Step Proof Pipeline: The centerpiece visual proof */}
      <HeroProofPipeline
        liveResults={heroResults}
        events={events}
        onSelectStep={(res) => {
          const match = events.find((e: any) => e.resource === res);
          if (match && select) select(match.id);
        }}
      />

      {/* Session Header Panel */}
      <Panel flush style={{ marginBottom: "var(--s5)" }}>
        <div className="session-bar-wrap">
          <div className="agent-identity">
            <div className="agent-name-row">
              <span className="agent-name">{SESSION.agentName}</span>
              <span className="chip ghost">REFERENCE AGENT</span>
            </div>
            <div className="agent-role dim">{SESSION.agentRole} &bull; Autonomous remediation workflow</div>
          </div>

          <div className="session-meta-grid">
            <div className="meta-item">
              <div className="k mono dim">SESSION ID</div>
              <div className="v mono">{SESSION.id}</div>
            </div>
            <div className="meta-item">
              <div className="k mono dim">TASK CONTRACT</div>
              <div className="v mono">{SESSION.contractId}</div>
            </div>
            <div className="meta-item">
              <div className="k mono dim">AUTHORIZATION</div>
              <div className="v mono txt-info">CEDAR DETERMINISTIC</div>
            </div>
            <div className="meta-item">
              <div className="k mono dim">LIFECYCLE STATE</div>
              <div className={`v mono ${denied ? "txt-deny font-bold" : "txt-allow"}`}>
                {denied ? "HALTED AT DENY" : "ACTIVE RUNNING"}
              </div>
            </div>
          </div>
        </div>

        <BoundaryVisual event={events[idx]} height={200} compact />
      </Panel>

      {/* Authoritative Verdict Card on DENY */}
      {denied ? (
        <div style={{ marginBottom: "var(--s5)" }}>
          <Verdict ev={denied} go={go} select={select} />
        </div>
      ) : null}

      {/* Scopes and Activity Stream */}
      <div className="grid g2" style={{ marginBottom: "var(--s5)" }}>
        <ScopePanel touched={touched} breached={denied ? denied.resource : null} />
        <ActivityStream events={events} idx={idx} go={go} select={select} />
      </div>

      <ProvenancePanel event={untrusted} />
    </>
  );
}
