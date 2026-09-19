import React from "react";
import PageHead from "../shared/PageHead.tsx";
import Panel from "../shared/Panel.tsx";
import StateChip from "../shared/StateChip.tsx";
import SourceFlag from "../shared/SourceFlag.tsx";
import DecisionChip from "../shared/DecisionChip.tsx";
import TrustChip from "../shared/TrustChip.tsx";
import { EVENTS } from "../../data/fixtures.js";
import { buildControlPlaneModel } from "../../data/controlPlane.ts";

export default function Sessions({ go, events = EVENTS, source = "FIXTURE", select }: any) {
  const model = buildControlPlaneModel(events, source);
  const sessionRows = model.sessions;

  return (
    <>
      <PageHead
        title="Sessions"
        desc="Sessions are derived from recorded ledger events when backend data is available; otherwise this view is explicitly demo/fallback."
        actions={<SourceFlag source={source} />}
      />

      <Panel flush>
        <div className="tablescroll is-scrollable">
          <div className="tablehint">SCROLL FOR SESSION DETAILS · ACTIONS REMAIN PINNED</div>
          <table className="dt control-table">
            <thead>
              <tr>
                <th className="sticky-key">SESSION ID</th><th>AGENT</th><th>TASK CONTRACT</th>
                <th>STARTED</th><th>DURATION</th><th>EVENTS</th>
                <th>DECISIONS</th><th>SOURCE</th><th>STATE</th><th className="sticky-actions" />
              </tr>
            </thead>
            <tbody>
              {sessionRows.map((row: any) => {
                return (
                  <tr key={row.id} className="clickable" onClick={() => go("execution")}>
                    <td className="m sticky-key">{row.id}</td>
                    <td>{row.agentId}</td>
                    <td className="m">{row.contractId}</td>
                    <td className="m dim">{row.startedAt ? row.startedAt.slice(11, 19) + "Z" : "UNKNOWN"}</td>
                    <td className="m dim">{row.durationMs == null ? "NOT AVAILABLE" : `${row.durationMs}ms`}</td>
                    <td className="m">{row.events.length}</td>
                    <td className="m">
                      {row.allowCount} allow / <span style={{ color: "var(--deny)" }}>{row.denyCount} deny</span> / {row.untrustedInputCount} ctx
                    </td>
                    <td><StateChip s={row.source} /></td>
                    <td><StateChip s={row.state} /></td>
                    <td className="sticky-actions">
                      <div className="actionstack">
                      <button className="btn sm" onClick={(e) => { e.stopPropagation(); go("recorder"); }}>Recorder</button>{" "}
                      <button className="btn sm" onClick={(e) => { e.stopPropagation(); go("lineage"); }}>Lineage</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {sessionRows.map((row: any) => (
        <Panel key={`${row.id}-events`} title={`CHRONOLOGICAL ACTIVITY · ${row.id}`} flush>
          <div className="tablescroll is-scrollable">
            <div className="tablehint">SCROLL FOR RESOURCE AND EXECUTION · EVENT STAYS PINNED</div>
            <table className="dt control-table">
              <thead>
                <tr><th>SEQ</th><th className="sticky-key">EVENT</th><th>ACTION</th><th>RESOURCE</th><th>TRUST</th><th>DECISION</th><th>EXECUTION</th><th className="sticky-actions" /></tr>
              </thead>
              <tbody>
                {row.events.map((event: any, index: number) => (
                  <tr
                    key={event.id}
                    className="clickable"
                    onClick={() => { select(event.id); go("decisions"); }}>
                    <td className="m dim">{String(event.seq || index + 1).padStart(3, "0")}</td>
                    <td className="m sticky-key">{event.id}</td>
                    <td className="m">{event.action}</td>
                    <td className="m">{event.resource}</td>
                    <td><TrustChip t={event.trust} /></td>
                    <td><DecisionChip d={event.decision} /></td>
                    <td className="m">{event.execution || "NOT AVAILABLE"}</td>
                    <td className="sticky-actions"><div className="actionstack"><span className="btn sm">Decision</span></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
    </>
  );
}
