import React, { useMemo, useState } from "react";
import aegisApi from "../../data/aegisApi.ts";
import { fmtT, SESSION } from "../../data/fixtures.js";
import BoundaryVisual from "../viz/BoundaryVisual.tsx";
import DecisionChip from "../shared/DecisionChip.tsx";
import TrustChip from "../shared/TrustChip.tsx";
import StateChip from "../shared/StateChip.tsx";

function DecorativePanel({ text = ["CONTROL", "OBSERVE", "INVESTIGATE", "VERIFY"] }: { text?: string[] }) {
  return (
    <aside className="secondary-art-panel" aria-hidden="true">
      <div>{text.map((line) => <span key={line}>{line}</span>)}</div>
    </aside>
  );
}

function InfoStrip({ items }: { items: Array<[string, React.ReactNode, string?]> }) {
  return (
    <section className="editorial-info-strip">
      {items.map(([label, value, tone]) => (
        <div key={label} className={tone ? `info-cell ${tone}` : "info-cell"}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}

export default function Execution({ events, idx, go, select, refresh }: any) {
  const safeEvents = Array.isArray(events) ? events : [];
  const visible = safeEvents.slice(0, idx + 1);
  const current = safeEvents[idx] || safeEvents[safeEvents.length - 1];
  const denied = visible.find((e: any) => e.decision === "DENY");
  const untrustedCount = visible.filter((e: any) => e.trust === "UNTRUSTED_EXTERNAL").length;
  const finalDecision = denied ? "DENY" : current?.decision || "UNKNOWN";

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
        setHeroStatus(`Step ${i + 1}/4: ${step.label}`);
        const response = await aegisApi.invoke("fs", "fs:read", step.resource, step.trust);
        setHeroResults((prev) => [...prev, { ...step, ...response }]);
        if (refresh) await refresh();
      }
      setHeroStatus("Hero flow complete. Recorded proof is available in Decisions, Evidence, Lineage, Replay, and Investigations.");
    } catch (e: any) {
      setHeroStatus(`Execution error: ${e.message}`);
    } finally {
      setRunningHero(false);
    }
  };

  const pathSteps = useMemo(() => ([
    {
      n: "01",
      title: "REQUEST",
      value: current?.resource || "NOT AVAILABLE",
      chip: <TrustChip t={current?.trust || "UNKNOWN"} />,
      desc: "Resource and action enter the gateway.",
    },
    {
      n: "02",
      title: "TASK CONTRACT",
      value: SESSION.contractId || "NOT AVAILABLE",
      chip: <StateChip s={SESSION.signature || "FIXTURE"} />,
      desc: "Declared authority bounds the request.",
    },
    {
      n: "03",
      title: "CONTEXT / PROVENANCE",
      value: current?.trust || "UNKNOWN",
      chip: <span className="mini-chip">RECORDED</span>,
      desc: "Origin travels with the runtime request.",
    },
    {
      n: "04",
      title: "CEDAR",
      value: current?.authProvider || "LOCAL-CEDAR",
      chip: <span className="mini-chip">POLICY GATE</span>,
      desc: "Policy decides before tool execution.",
    },
    {
      n: "05",
      title: "DECISION",
      value: current?.decision || "UNKNOWN",
      chip: <DecisionChip d={current?.decision} />,
      desc: current?.decision === "DENY" ? "Executor is not reached." : "Executor is reached only after allow.",
    },
  ]), [current]);

  return (
    <div className="secondary-page execution-page">
      <section className="secondary-hero">
        <div>
          <div className="editorial-kicker">EXECUTION · RUNTIME</div>
          <h1 className="editorial-page-title">AGENT EXECUTION</h1>
          <p className="editorial-page-copy">
            DevFix is a reference agent running through the local Aegis PEP. This phase verifies
            filesystem authorization only; shell and npm audit execution are not exposed.
          </p>
        </div>
        <div className="secondary-actions">
          <button className="btn primary" onClick={runLiveHeroFlow} disabled={runningHero}>
            {runningHero ? (heroStatus || "Executing PEP...") : "Run Live Hero Flow"}
          </button>
          <button className="btn" onClick={() => go("contracts")}>Task contract</button>
          <button className="btn" onClick={() => go("recorder")}>Flight recorder</button>
        </div>
        <DecorativePanel />
      </section>

      {(heroStatus || heroResults.length > 0) ? (
        <section className="hero-run-strip">
          <strong>{heroStatus}</strong>
          {heroResults.length > 0 ? (
            <span>{heroResults.length} live PEP request{heroResults.length === 1 ? "" : "s"} recorded</span>
          ) : null}
        </section>
      ) : null}

      <InfoStrip
        items={[
          ["AGENT", SESSION.agentName],
          ["SESSION", SESSION.id],
          ["TASK CONTRACT", SESSION.contractId],
          ["AUTHORITY", "Declared Scope"],
          ["STATE", denied ? "HALTED AT DENY" : "RUNNING", denied ? "deny" : "allow"],
        ]}
      />

      <section className="editorial-visual-panel">
        <BoundaryVisual event={current} height={460} compact={false} replayIndex={idx} total={safeEvents.length} />
      </section>

      <section className="editorial-panel auth-panel">
        <div className="editorial-panel-head">
          <h2>REQUEST AUTHORIZATION PATH</h2>
        </div>
        <div className="editorial-path-strip">
          {pathSteps.map((step) => (
            <article className="path-card" key={step.n}>
              <span>{step.n}</span>
              <h3>{step.title}</h3>
              <strong className="mono">{step.value}</strong>
              <div>{step.chip}</div>
              <p>{step.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="execution-bottom-grid">
        <article className="editorial-panel">
          <div className="editorial-panel-head">
            <h2>EXECUTION LOG</h2>
          </div>
          <div className="execution-log-list">
            {visible.map((e: any) => (
              <button
                key={e.id}
                className="execution-log-row"
                onClick={() => {
                  select?.(e.id);
                  go("decisions");
                }}>
                <span className="mono">{fmtT(e.t)}</span>
                <strong className="mono">{e.id}</strong>
                <em className={e.decision === "DENY" ? "deny" : e.decision === "ALLOW" ? "allow" : ""}>{e.decision}</em>
                <small className="mono">{e.action} · {e.resource}</small>
              </button>
            ))}
          </div>
        </article>

        <article className="editorial-panel">
          <div className="editorial-panel-head">
            <h2>EXECUTION SUMMARY</h2>
          </div>
          <div className="summary-grid">
            <div className="summary-tile">
              <span>D</span>
              <small>FINAL DECISION</small>
              <strong className={finalDecision === "DENY" ? "deny" : finalDecision === "ALLOW" ? "allow" : ""}>{finalDecision}</strong>
            </div>
            <div className="summary-tile">
              <span>E</span>
              <small>EVENTS PROCESSED</small>
              <strong>{visible.length}</strong>
            </div>
            <div className="summary-tile">
              <span>U</span>
              <small>UNTRUSTED INPUTS</small>
              <strong>{untrustedCount}</strong>
            </div>
            <div className="summary-tile">
              <span>S</span>
              <small>EXECUTION STATE</small>
              <strong className={denied ? "deny" : ""}>{denied ? "HALTED AT DENY" : "ACTIVE"}</strong>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
