import React from "react";
import PageHead from "../shared/PageHead.tsx";
import Panel from "../shared/Panel.tsx";
import KV from "../shared/KV.tsx";
import Note from "../shared/Note.tsx";
import DecisionChip from "../shared/DecisionChip.tsx";
import TrustChip from "../shared/TrustChip.tsx";
import StateChip from "../shared/StateChip.tsx";
import EvaluationChain from "./EvaluationChain.tsx";
import { SESSION } from "../../data/fixtures.js";
import { eventTraceId } from "../../data/controlPlane.ts";

export default function Decisions({ events, selected, select, go, source }: any) {
  const safeEvents = Array.isArray(events) ? events : [];
  const ev = safeEvents.find((e: any) => e.id === selected) || safeEvents[safeEvents.length - 1];
  const contractLabel = ev?.contractId || (ev?.sessionId ? "NOT AVAILABLE" : SESSION.contractId);

  if (!ev) {
    return (
      <>
        <PageHead title="Authorization Decisions" desc="Every request an agent makes is evaluated against its declared authority before any tool runs." />
        <Panel title="DECISION LOG">
          <Note kind="info">NO LIVE EVENT RECORDED</Note>
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Authorization Decisions"
        desc="Every request an agent makes is evaluated against its declared authority before any tool runs."
      />

      <Panel title="DECISION LOG" flush>
        <div className="tablescroll is-scrollable">
          <div className="tablehint">SCROLL FOR FULL POLICY REASON · EVENT ID STAYS PINNED</div>
          <table className="dt control-table">
            <thead>
              <tr>
                <th>T+</th><th>PRINCIPAL</th><th>ACTION</th><th>RESOURCE</th>
                <th>CONTEXT</th><th>DECISION</th><th>REASON</th><th className="sticky-actions">EVENT</th>
              </tr>
            </thead>
            <tbody>
              {safeEvents.map((e: any) => (
                <tr
                  key={e.id}
                  className={"clickable" + (e.id === ev.id ? " sel" : "")}
                  onClick={() => select(e.id)}>
                  <td className="m dim">{e.t.toFixed(3)}</td>
                  <td className="m">{e.agentId || (source === "FIXTURE" ? SESSION.agentId : "NOT AVAILABLE")}</td>
                  <td className="m">{e.action}</td>
                  <td className="m">{e.resource}</td>
                  <td className="m">
                    {e.trust === "UNTRUSTED_EXTERNAL"
                      ? <span style={{ color: "var(--amber)" }}>untrusted &#9888;</span>
                      : <span className="dim">{e.trust.toLowerCase()}</span>}
                  </td>
                  <td><DecisionChip d={e.decision} /></td>
                  <td className="m dim">{e.reason}</td>
                  <td className="m sticky-actions">{e.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <PageHead
        title={"Decision detail \u00b7 " + eventTraceId(ev)}
        desc={ev.detail}
        actions={
          <>
            <button className="btn" onClick={() => go("contracts")} disabled={contractLabel === "NOT AVAILABLE"}>Task contract</button>
            <button className="btn" onClick={() => go("policies")}>Policy</button>
            <button className="btn" onClick={() => go("evidence")}>Evidence</button>
            <button className="btn" onClick={() => go("lineage")}>Lineage</button>
          </>
        }
      />

      <div className="grid g2">
        <Panel title="SECURITY RECORD">
          <KV
            rows={[
              ["TRACE ID", eventTraceId(ev)],
              ["WHO", `${ev.agentId || (source === "FIXTURE" ? SESSION.agentName : "NOT AVAILABLE")} (Agent::"${ev.agentId || (source === "FIXTURE" ? SESSION.agentId : "NOT AVAILABLE")}")`],
              ["SESSION", ev.sessionId || (source === "FIXTURE" ? SESSION.id : "NOT AVAILABLE")],
              ["WHAT", ev.action],
              ["RESOURCE", ev.resource],
              ["TASK CONTRACT", contractLabel],
              ["CONTEXT", <TrustChip t={ev.trust} />],
              ["DECISION", <DecisionChip d={ev.decision} />],
              ["REASON", ev.reason],
              ["AUTHORITY", ev.authProvider || "UNKNOWN"],
              ["EXECUTION", <StateChip s={ev.execution || "UNAVAILABLE"} />],
              ["EXPOSURE", ev.bytes == null ? "UNKNOWN" : ev.bytes + " BYTES"],
              ["HTTP", ev.http == null ? "UNKNOWN" : String(ev.http)],
            ]}
          />
        </Panel>

        <Panel title="POLICY EVALUATION" flush>
          <div style={{ padding: "var(--s4)" }}>
            <EvaluationChain ev={ev} />
          </div>
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)" }}>
            <Note kind="info">
              This is an event-backed explanation. The backend exposes the final decision and
              reason, not a first-class decisionId or full Cedar diagnostic trace. Enforcement
              happens at the Aegis gateway before the protected tool runs.
            </Note>
          </div>
        </Panel>
      </div>
    </>
  );
}
