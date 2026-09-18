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

export default function FlightRecorder({ events, idx, setIdx, select, go, source }: any) {
  const safeEvents = Array.isArray(events) ? events : [];
  const currentEvent = safeEvents[idx] || safeEvents[0];
  const isDeny = currentEvent?.decision === "DENY";

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

      <Panel title="REPLAY BOUNDARY SIMULATION" flush style={{ marginBottom: "var(--s5)" }}>
        <BoundaryVisual event={currentEvent} height={260} />
      </Panel>

      <div className="grid g2" style={{ marginBottom: "var(--s5)" }}>
        <Panel title={"EVENT " + (currentEvent ? currentEvent.id : "—") + " · ACTIVE REPLAY STEP"}>
          {currentEvent ? (
            <KV
              rows={[
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
          <div className="tablescroll" style={{ maxHeight: 380 }}>
            <table className="dt">
              <thead>
                <tr>
                  <th>SEQ</th>
                  <th>ID</th>
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
                      <td className="m dim" style={{ position: "relative", paddingLeft: 24 }}>
                        <div style={{
                          position: "absolute",
                          left: 8,
                          top: "50%",
                          transform: "translateY(-50%)",
                          width: e.decision === "DENY" ? 10 : 8,
                          height: e.decision === "DENY" ? 10 : 8,
                          borderRadius: e.decision === "DENY" ? "2px" : "50%",
                          background: e.decision === "DENY" ? "var(--deny)" : e.trust === "UNTRUSTED_EXTERNAL" ? "var(--amber)" : "var(--allow)",
                          boxShadow: isCurrent ? `0 0 8px ${e.decision === "DENY" ? "var(--deny)" : e.trust === "UNTRUSTED_EXTERNAL" ? "var(--amber)" : "var(--allow)"}` : "none",
                        }}></div>
                        {String(i + 1).padStart(2, "0")}
                      </td>
                      <td className="m">{e.id}</td>
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
