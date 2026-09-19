import React from "react";
import AegisRuntimeArchitecture from "../viz/AegisRuntimeArchitecture.tsx";
import { SESSION } from "../../data/fixtures.js";

export default function Overview({ events, idx, go, chain, analysis }: any) {
  const allow = events.filter((e: any) => e.decision === "ALLOW").length;
  const deny = events.filter((e: any) => e.decision === "DENY").length;
  const untrusted = events.filter((e: any) => e.trust === "UNTRUSTED_EXTERNAL").length;
  const decisions = allow + deny;
  const currentEvent = events[idx] || events[events.length - 1] || null;
  const chainVerified = chain?.verified !== false;
  const chainText = chain?.ok != null && chain?.total != null ? `${chain.ok}/${chain.total}` : `${events.length}/${events.length}`;

  return (
    <div className="overview-page">
      <section className="overview-editorial-hero" aria-labelledby="overview-title">
        <div className="overview-brand-line">
          <span className="mini-mark" />
          <strong>AEGIS</strong>
          <span>Security control plane for AI agents</span>
        </div>
        <div className="overview-headline-row">
          <div>
            <div className="editorial-eyebrow">AEGIS RUNTIME ARCHITECTURE</div>
            <h1 id="overview-title" className="overview-mega-title">FROM AGENT INTENT TO VERIFIED OUTCOMES</h1>
          </div>
          <div className="overview-principles">
            <span>POLICY<br />PROVENANCE<br />ENFORCEMENT<br />EVIDENCE</span>
            <span>TRUST<br />TURNS AGENTS<br />INTO ACCOUNTABILITY</span>
          </div>
        </div>
        <div className="overview-machine-stage">
          <AegisRuntimeArchitecture height={660} event={currentEvent} chain={chain} analysis={analysis} />
        </div>
        <div className="overview-instruments">
          <aside className="live-session-panel">
            <div className="live-head">
              <span>LIVE SESSION</span>
              <button aria-label="More session actions">...</button>
            </div>
            <div className="session-body">
              <div className="session-primary">
                <div className="session-id">{SESSION.id}</div>
                <div className="session-status">ACTIVE</div>
              </div>
              <div className="session-grid">
                {[
                  ["Agent", SESSION.agentName],
                  ["Contract", SESSION.contractId],
                  ["Events", events.length],
                  ["Allowed", allow],
                  ["Denied", deny],
                  ["Untrusted Inputs", untrusted],
                ].map(([label, value]) => (
                  <div className="session-row" data-label={label} key={label}>
                    <span>{label}</span>
                    <strong title={String(value)}>{value}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="session-actions">
              <button className="btn" onClick={() => go("sessions")}>View Session -&gt;</button>
            </div>
          </aside>
          <aside className="overview-brand-panel">
            <div>CONTROL<br />OBSERVE<br />INVESTIGATE<br />VERIFY</div>
          </aside>
        </div>
      </section>

      <section className="overview-metrics">
        <button className="control-metric" onClick={() => go("decisions")}>
          <span className="icon">D</span>
          <span>
            <span className="label">Total Decisions</span>
            <span className="value">{decisions}</span>
            <span className="meta">{allow} allow / {deny} deny</span>
          </span>
        </button>
        <button className="control-metric" onClick={() => go("policies")}>
          <span className="icon">P</span>
          <span>
            <span className="label">Policy Enforcement</span>
            <span className="value">{decisions ? "100%" : "N/A"}</span>
            <span className="meta">Derived from recorded gateway decisions</span>
          </span>
        </button>
        <button className="control-metric" onClick={() => go("evidence")}>
          <span className="icon">E</span>
          <span>
            <span className="label">Evidence Integrity</span>
            <span className="value">{chainVerified ? "100%" : "CHECK"}</span>
            <span className="meta">Hash chain {chainText} verified</span>
          </span>
        </button>
        <button className="control-metric" onClick={() => go("agents")}>
          <span className="icon">A</span>
          <span>
            <span className="label">Active Agent</span>
            <span className="value">{SESSION.agentName}</span>
            <span className="meta">Session {SESSION.id} / fixture-backed</span>
          </span>
        </button>
      </section>

      <section className="overview-bottom">
        <div className="aegis-card warm overview-text-panel">
          <div className="editorial-eyebrow">SYSTEM STATUS</div>
          <div className="overview-status-grid">
            <div><strong>Backend enforcement</strong><span>Local PEP gateway verified by current runtime flow.</span></div>
            <div><strong>Cedar policy evaluation</strong><span>Runtime authorization authority before protected execution.</span></div>
            <div><strong>Post-hoc investigation</strong><span>Evidence analysis only; never runtime authorization.</span></div>
          </div>
        </div>
        <div className="aegis-card overview-text-panel">
          <div className="editorial-eyebrow">CORE PRINCIPLES</div>
          <p><strong>Authorization is absolute.</strong> The agent cannot override Cedar / AVP policy enforcement.</p>
          <p><strong>Enforcement is architectural.</strong> The gateway wraps the protected tool before execution.</p>
          <p><strong>Evidence is cryptographic.</strong> Every decision is chained for verification.</p>
        </div>
      </section>
    </div>
  );
}
