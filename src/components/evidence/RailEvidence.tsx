import React from "react";
import DecisionChip from "../shared/DecisionChip.tsx";
import { fmtT } from "../../data/fixtures.js";

export default function RailEvidence({ events, idx, selected, select }: any) {
  const safeEvents = Array.isArray(events) ? events : [];
  const visible = safeEvents.slice(0, idx + 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div className="railhead">
        EVIDENCE STREAM
        <span style={{ marginLeft: "auto" }}>{visible.length} of {safeEvents.length}</span>
      </div>
      <div style={{ flex: "1 1 auto", overflowY: "auto" }}>
        {visible.map((e: any) => (
          <button
            key={e.id}
            className={"railitem" + (e.id === selected ? " sel" : "")}
            onClick={() => select(e.id)}>
            <div className="id">{e.id}</div>
            <div style={{ textAlign: "right", gridColumn: "2/4" }}><DecisionChip d={e.decision} /></div>
            <div className="h">{fmtT(e.t)} &middot; {e.tool}</div>
            <div className="railmeta">{e.action} · {e.resource}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
