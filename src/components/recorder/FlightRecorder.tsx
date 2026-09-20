import React, { useMemo } from "react";
import BoundaryVisual from "../viz/BoundaryVisual.tsx";
import DecisionChip from "../shared/DecisionChip.tsx";
import SourceFlag from "../shared/SourceFlag.tsx";
import TrustChip from "../shared/TrustChip.tsx";
import { fmtT, short } from "../../data/fixtures.js";
import { buildControlPlaneModel } from "../../data/controlPlane.ts";

function DecorativePanel() {
  return (
    <aside className="secondary-art-panel trust" aria-hidden="true">
      <div>
        <span>TRUST</span>
        <span>TURNS AGENTS</span>
        <span>INTO ACCOUNTABILITY</span>
      </div>
    </aside>
  );
}

export default function FlightRecorder({ events, idx, setIdx, select, go, source }: any) {
  const safeEvents = Array.isArray(events) ? events : [];
  const currentEvent = safeEvents[idx] || safeEvents[0];
  const isDeny = currentEvent?.decision === "DENY";
  const model = buildControlPlaneModel(safeEvents, source);
  const activeSession = model.sessions.find((session) => session.events.some((event: any) => event.id === currentEvent?.id)) || model.sessions[0];
  const isEnd = idx >= safeEvents.length - 1;
  const isStart = idx <= 0;

  const sequenceRows = useMemo(() => safeEvents.map((event: any, i: number) => ({
    event,
    i,
    state: i < idx ? "executed" : i === idx ? "active" : "pending",
  })), [safeEvents, idx]);

  const setReplayIdx = (next: number) => {
    const clamped = Math.max(0, Math.min(safeEvents.length - 1, next));
    setIdx(clamped);
    if (safeEvents[clamped]) select(safeEvents[clamped].id);
  };

  return (
    <div className="secondary-page recorder-page">
      <section className="secondary-hero">
        <div>
          <div className="editorial-kicker">REPLAY · ANALYZE · INVESTIGATE</div>
          <h1 className="editorial-page-title">FLIGHT RECORDER</h1>
          <p className="editorial-page-copy">
            Passive replay of recorded session events. Replay is visual-only and does not
            re-execute any tools or actions.
          </p>
        </div>
        <div className="secondary-actions">
          <SourceFlag source={source} />
          <button className="btn" onClick={() => go("decisions")}>Decisions</button>
          <button className="btn" onClick={() => go("investigations")}>Investigate</button>
        </div>
        <DecorativePanel />
      </section>

      <section className="replay-strip">
        <div className="replay-strip-meta">
          <div>
            <span>SESSION</span>
            <strong className="mono">{activeSession?.id || "NOT AVAILABLE"}</strong>
          </div>
          <div>
            <span>REPLAY SOURCE</span>
            <strong className="mono">{source === "LIVE" ? "BACKEND-RECORDED EVENT ORDER" : "FRONTEND-DERIVED EVENT ORDER"}</strong>
          </div>
        </div>
        <div className="replay-strip-actions">
          <button className="btn" disabled={isStart} onClick={() => setReplayIdx(idx - 1)}>Previous</button>
          <button className="btn primary" onClick={() => setReplayIdx(0)}>Replay</button>
          <button className="btn" disabled={isEnd} onClick={() => setReplayIdx(idx + 1)}>Next</button>
        </div>
      </section>

      <section className="editorial-visual-panel replay-visual-panel">
        <BoundaryVisual event={currentEvent} height={470} replayIndex={idx} total={safeEvents.length} />
        <div className="replay-legend">
          <span><i className="replay-dot active" /> Replay Position</span>
          <span><i className="replay-dot executed" /> Executed</span>
          <span><i className="replay-dot pending" /> Pending</span>
        </div>
      </section>

      <section className="editorial-panel recorder-controls-panel">
        <div className="editorial-panel-head">
          <h2>REPLAY CONTROLS</h2>
          <span className="mono">{currentEvent ? `${fmtT(currentEvent.t)} · ${currentEvent.id}` : "NO EVENT"}</span>
        </div>
        <div className="recorder-timeline">
          {sequenceRows.map(({ event, i, state }) => (
            <button
              key={event.id}
              className={`recorder-tick ${state}`}
              style={{ left: `${(i / Math.max(1, safeEvents.length - 1)) * 100}%` }}
              onClick={() => setReplayIdx(i)}
              title={`${i + 1}: ${event.id}`}>
              <span />
            </button>
          ))}
        </div>
      </section>

      <section className="recorder-bottom-grid">
        <article className="editorial-panel">
          <div className="editorial-panel-head">
            <h2>ACTIVE REPLAY EVENT</h2>
          </div>
          {currentEvent ? (
            <div className="active-event-grid">
              <span>EVENT ID</span><strong className="mono">{currentEvent.id}</strong>
              <span>TIMESTAMP</span><strong className="mono">{fmtT(currentEvent.t)}</strong>
              <span>ACTION</span><strong className="mono">{currentEvent.action}</strong>
              <span>RESOURCE</span><strong className="mono">{currentEvent.resource}</strong>
              <span>CONTEXT</span><strong><TrustChip t={currentEvent.trust} /></strong>
              <span>DECISION</span><strong><DecisionChip d={currentEvent.decision} /></strong>
              <span>REASON</span><strong className={isDeny ? "deny mono" : "mono"}>{currentEvent.reason || "NOT AVAILABLE"}</strong>
              <span>HASH</span><strong className="mono">{short(currentEvent.curr)}</strong>
            </div>
          ) : (
            <div className="muted">No replay event selected.</div>
          )}
        </article>

        <article className="editorial-panel sequence-panel">
          <div className="editorial-panel-head">
            <h2>REPLAY EVENT SEQUENCE</h2>
            <span>Scroll for resource · event ID stays pinned</span>
          </div>
          <div className="sequence-table-wrap">
            <table className="dt editorial-sequence-table">
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
                {sequenceRows.map(({ event, i, state }) => (
                  <tr
                    key={event.id}
                    className={`clickable ${state}`}
                    onClick={() => setReplayIdx(i)}>
                    <td className="m dim">{String(i + 1).padStart(2, "0")}</td>
                    <td className="m sticky-key">{event.id}</td>
                    <td className="m">{event.action}</td>
                    <td className="m">{event.resource}</td>
                    <td><DecisionChip d={event.decision} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="recorder-actions">
        <button className="btn" onClick={() => currentEvent && select(currentEvent.id)}>Pin Event</button>
        <button className="btn" onClick={() => go("decisions")}>Export Session</button>
        <button className="btn" onClick={() => go("investigations")}>Open in Investigations</button>
      </section>
    </div>
  );
}
