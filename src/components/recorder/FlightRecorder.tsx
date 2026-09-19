import React from "react";
import PageHead from "../shared/PageHead.tsx";
import Panel from "../shared/Panel.tsx";
import Note from "../shared/Note.tsx";
import KV from "../shared/KV.tsx";
import DecisionChip from "../shared/DecisionChip.tsx";
import TrustChip from "../shared/TrustChip.tsx";
import SourceFlag from "../shared/SourceFlag.tsx";
import BoundaryVisual from "../viz/BoundaryVisual.tsx";
import { fmtT, short } from "../../data/fixtures.js";
import { buildControlPlaneModel } from "../../data/controlPlane.ts";

export default function FlightRecorder({ events, idx, setIdx, select, go, source }: any) {
  const safeEvents = Array.isArray(events) ? events : [];
  const currentEvent = safeEvents[idx] || safeEvents[0];
  const isDeny = currentEvent?.decision === "DENY";
  const model = buildControlPlaneModel(safeEvents, source);
  const activeSession = model.sessions.find((session) => session.events.some((event: any) => event.id === currentEvent?.id)) || model.sessions[0];
  const isEnd = idx >= safeEvents.length - 1;
  const isStart = idx <= 0;

  return (
    <>
      <PageHead
        title="Flight Recorder"
        desc="Passive replay of recorded session events. Replay is visual-only and does not re-execute any tools or actions."
        actions={
          <>
            <SourceFlag source={source} />
            <button className="btn" onClick={() => go("decisions")}>Decisions</button>
            <button className="btn" onClick={() => go("investigations")}>Investigate</button>
          </>
        }
      />

      <Panel flush style={{ marginBottom: "var(--s5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s5)", padding: "var(--s4)", flexWrap: "wrap" }}>
          <div>
            <div className="mono dim" style={{ fontSize: 9.5, letterSpacing: ".12em" }}>SESSION</div>
            <div className="mono" style={{ fontSize: 13 }}>{activeSession?.id || "NOT AVAILABLE"}</div>
          </div>
          <div>
            <div className="mono dim" style={{ fontSize: 9.5, letterSpacing: ".12em" }}>REPLAY SOURCE</div>
            <div className="mono" style={{ fontSize: 13 }}>FRONTEND-DERIVED EVENT ORDER</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" disabled={isStart} onClick={() => { setIdx(Math.max(0, idx - 1)); }}>Previous</button>
            <button className="btn primary" onClick={() => { setIdx(isEnd ? 0 : Math.min(safeEvents.length - 1, idx + 1)); }}>
              {isEnd ? "Replay" : "Play Step"}
            </button>
            <button className="btn" disabled={isEnd} onClick={() => { setIdx(Math.min(safeEvents.length - 1, idx + 1)); }}>Next</button>
          </div>
        </div>
      </Panel>

      <Panel title="REPLAY BOUNDARY SIMULATION" flush style={{ marginBottom: "var(--s5)" }}>
        <BoundaryVisual event={currentEvent} height={260} />
      </Panel>

      <div className="grid g2" style={{ marginBottom: "var(--s5)" }}>
        <Panel title={"EVENT " + (currentEvent ? currentEvent.id : "—") + " · ACTIVE REPLAY STEP"}>
          {currentEvent ? (
            <KV
              rows={[
                ["SESSION", activeSession?.id || "NOT AVAILABLE"],
                ["SEQUENCE", `Step ${idx + 1} of ${safeEvents.length}`],
                ["TIMESTAMP", fmtT(currentEvent.t)],
                ["ACTION", currentEvent.action],
                ["RESOURCE", currentEvent.resource],
                ["CONTEXT / TRUST", <TrustChip t={currentEvent.trust} />],
                ["DECISION", <DecisionChip d={currentEvent.decision} />],
                ["CEDAR REASON", currentEvent.reason],
                ["TOOL EXECUTION", currentEvent.execution],
                ["DATA EXPOSURE", currentEvent.bytes == null ? "UNKNOWN" : `${currentEvent.bytes} BYTES`],
                ["HTTP STATUS", currentEvent.http != null ? String(currentEvent.http) : "UNKNOWN"],
                ["PREVIOUS HASH", <span className="mono dim">{currentEvent.prev ? short(currentEvent.prev) : "GENESIS"}</span>],
                ["CURRENT HASH", <span className="mono">{short(currentEvent.curr)}</span>],
              ]}
            />
          ) : (
            <div className="muted">No event selected.</div>
          )}

          <div style={{ marginTop: "var(--s4)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn sm"
              onClick={() => {
                select(currentEvent.id);
                go("decisions");
              }}>
              WHY (Decisions)
            </button>
            <button
              className="btn sm"
              onClick={() => {
                select(currentEvent.id);
                go("lineage");
              }}>
              View Lineage
            </button>
            <button
              className="btn sm"
              onClick={() => {
                select(currentEvent.id);
                go("investigations");
              }}>
              Forensic Investigation
            </button>
          </div>
        </Panel>

        <Panel title="REPLAY EVENT SEQUENCE" flush>
          <div className="tablescroll is-scrollable" style={{ maxHeight: 380 }}>
            <div className="tablehint">SCROLL FOR RESOURCE · EVENT ID STAYS PINNED</div>
            <table className="dt control-table">
              <thead>
                <tr>
                  <th>SEQ</th>
                  <th className="sticky-key">ID</th>
                  <th>ACTION</th>
                  <th>RESOURCE</th>
                  <th>DECISION</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e: any, i: number) => {
                  const isCurrent = i === idx;
                  const isPast = i < idx;
                  return (
                    <tr
                      key={e.id}
                      className={"clickable" + (isCurrent ? " sel" : "")}
                      style={{ opacity: isCurrent ? 1 : isPast ? 0.8 : 0.4 }}
                      onClick={() => setIdx(i)}>
                      <td className="m dim">{String(i + 1).padStart(2, "0")}</td>
                      <td className="m sticky-key">{e.id}</td>
                      <td className="m">{e.action}</td>
                      <td className="m">{e.resource}</td>
                      <td><DecisionChip d={e.decision} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)" }}>
            <Note kind={isDeny ? "deny" : "info"}>
              {isDeny
                ? "HALTED AT DENY: Gateway refused execution before the protected tool could read the resource."
                : "Step forward or press Space to play the flight recording."}
            </Note>
          </div>
        </Panel>
      </div>
    </>
  );
}
