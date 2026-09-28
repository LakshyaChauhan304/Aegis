import React from "react";
import Panel from "../shared/Panel.tsx";
import PageHead from "../shared/PageHead.tsx";
import Chip from "../shared/Chip.tsx";
import Note from "../shared/Note.tsx";
import SourceFlag from "../shared/SourceFlag.tsx";
import DecisionChip from "../shared/DecisionChip.tsx";
import TrustChip from "../shared/TrustChip.tsx";
import { CONTRACT } from "../../data/fixtures.js";
import { buildControlPlaneModel } from "../../data/controlPlane.ts";

export default function Agents({ events, go, select, source = "FIXTURE" }: any) {
  const model = buildControlPlaneModel(events, source);
  const agent = model.agent;
  const primarySession = model.sessions[0];
  const contractId = agent.contractIds[0] || "NOT AVAILABLE";

  return (
    <>
      <PageHead
        title="Agents"
        desc="Who operates through AEGIS. This view is connected through the current event stream; it does not claim a backend multi-agent registry."
        actions={<SourceFlag source={agent.source} />}
      />

      <div className="grid g4" style={{ marginBottom: "var(--s5)" }}>
        <Panel title="REFERENCE AGENT">
          <div style={{ fontSize: 18, fontWeight: 600 }}>{agent.name}</div>
          <div className="muted" style={{ fontSize: 12 }}>{agent.role}</div>
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Chip kind="info">AGENT {agent.id}</Chip>
            <Chip kind="ghost">{agent.source}</Chip>
          </div>
        </Panel>
        <Panel title="ACTIVE SESSIONS">
          <button className="bigstat" onClick={() => go("sessions")} style={{ textAlign: "left" }}>
            <div className="n">{agent.sessionIds.length || "0"}</div>
            <div className="l">{primarySession ? primarySession.id : "NOT AVAILABLE"}</div>
          </button>
        </Panel>
        <Panel title="DECISIONS">
          <div style={{ display: "flex", gap: 18, alignItems: "baseline" }}>
            <div className="bigstat"><div className="n allow">{agent.allowCount}</div><div className="l">ALLOW</div></div>
            <div className="bigstat"><div className="n deny">{agent.denyCount}</div><div className="l">DENY</div></div>
          </div>
        </Panel>
        <Panel title="UNTRUSTED INPUTS">
          <div className="bigstat">
            <div className="n" style={{ color: agent.untrustedInputCount ? "var(--amber)" : "var(--fg)" }}>{agent.untrustedInputCount}</div>
            <div className="l">CONTEXT EVENTS</div>
          </div>
        </Panel>
      </div>

      <Panel flush>
        <div className="tablescroll is-scrollable">
          <div className="tablehint">SCROLL FOR SCOPE · ACTIONS REMAIN PINNED</div>
          <table className="dt control-table">
            <thead>
              <tr>
                <th className="sticky-key">AGENT</th><th>ROLE</th><th>SESSION</th><th>TASK CONTRACT</th>
                <th>SCOPE</th><th>DECISIONS</th><th>STATE</th><th className="sticky-actions" />
              </tr>
            </thead>
            <tbody>
              <tr className="clickable" onClick={() => go("execution")}>
                <td className="sticky-key" style={{ fontWeight: 600 }}>{agent.name}</td>
                <td className="muted">{agent.role}</td>
                <td className="m">{primarySession ? primarySession.id : "NOT AVAILABLE"}</td>
                <td className="m">{contractId}</td>
                <td className="m dim">
                  {agent.source === "FIXTURE"
                    ? `${CONTRACT.tools.length} tools · ${CONTRACT.fsAllow.length} paths · ${CONTRACT.network.length} host`
                    : "NOT AVAILABLE"}
                </td>
                <td className="m">
                  <span style={{ color: "var(--allow)" }}>{agent.allowCount} allow</span>
                  <span className="dim"> / </span>
                  <span style={{ color: "var(--deny)" }}>{agent.denyCount} deny</span>
                </td>
                <td><Chip kind="info" icon="&#9679;">{source === "LIVE" || source === "DERIVED" ? "COMPLETED" : "ACTIVE"}</Chip></td>
                <td className="sticky-actions">
                  <div className="actionstack">
                  <button className="btn sm" onClick={(e) => { e.stopPropagation(); go("execution"); }}>Execution</button>{" "}
                  <button className="btn sm" onClick={(e) => { e.stopPropagation(); go("sessions"); }} disabled={!primarySession}>Session</button>{" "}
                  <button className="btn sm" onClick={(e) => { e.stopPropagation(); go("contracts"); }} disabled={contractId === "NOT AVAILABLE"}>Contract</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="RECENT ACTIVITY" flush>
        <div className="tablescroll is-scrollable">
          <div className="tablehint">SCROLL FOR FULL RESOURCE · DECISION TARGET STAYS PINNED</div>
          <table className="dt control-table">
            <thead>
              <tr><th className="sticky-key">EVENT</th><th>SESSION</th><th>ACTION</th><th>RESOURCE</th><th>TRUST</th><th>DECISION</th><th className="sticky-actions" /></tr>
            </thead>
            <tbody>
              {agent.recentEvents.map((event: any) => (
                <tr
                  key={event.id}
                  className="clickable"
                  onClick={() => { select(event.id); go("decisions"); }}>
                  <td className="m sticky-key">{event.id}</td>
                  <td className="m dim">{event.sessionId || primarySession?.id || "NOT AVAILABLE"}</td>
                  <td className="m">{event.action}</td>
                  <td className="m">{event.resource}</td>
                  <td><TrustChip t={event.trust} /></td>
                  <td><DecisionChip d={event.decision} /></td>
                  <td className="sticky-actions"><div className="actionstack"><span className="btn sm">Decision</span></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Note>
        Aegis is the platform. DevFix is the current reference agent. Contract metadata is
        fixture-backed unless a live API supplies it; the backend does not currently expose a
        general agent registry.
      </Note>
    </>
  );
}
