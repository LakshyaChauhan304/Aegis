import React from "react";
import PageHead from "../shared/PageHead.tsx";
import Panel from "../shared/Panel.tsx";
import SourceFlag from "../shared/SourceFlag.tsx";
import Chip from "../shared/Chip.tsx";
import Note from "../shared/Note.tsx";
import { LINEAGE_NODES, LINEAGE_EDGES } from "../../data/fixtures.js";

function buildLiveLineage(events: any[]) {
  const safe = Array.isArray(events) ? events : [];
  return safe.slice(-8).map((event, index) => ({
    id: event.id,
    x: 40 + (index % 4) * 230,
    y: 60 + Math.floor(index / 4) * 170,
    w: 190,
    h: 58,
    l: `${event.decision || "UNKNOWN"} · ${event.resource || "resource unknown"}`,
    s: `${event.authProvider || "UNKNOWN"} · ${event.trust || "UNKNOWN"}`,
    ev: event.id,
    kind: event.decision === "DENY" ? "deny" : event.trust === "UNTRUSTED_EXTERNAL" ? "warn" : "",
    prev: event.prev,
    curr: event.curr,
  }));
}

export default function LineageVisual({ go, selected, select, source, events = [] }: any) {
  const W = 1000;
  const H = 460;
  const noRecordedEvents = source !== "FIXTURE" && (!Array.isArray(events) || events.length === 0);
  const useLive = source === "LIVE" && Array.isArray(events) && events.length > 0;
  const liveNodes = buildLiveLineage(events);
  const nodes = noRecordedEvents ? [] : useLive ? liveNodes : LINEAGE_NODES;
  const edges = useLive
    ? liveNodes.slice(1).map((node, index) => [liveNodes[index].id, node.id, "hash"])
    : noRecordedEvents ? [] : LINEAGE_EDGES;

  return (
    <>
      <PageHead
        title="Evidence Lineage"
        desc={useLive
          ? "Evidence-backed lineage derived from recorded ledger events and SHA-256 linear hash-chain links."
          : noRecordedEvents ? "NO LIVE EVENT RECORDED. Live lineage is unavailable until a backend run is recorded."
          : "Demo/fallback lineage. Live ledger relationships are unavailable."}
        actions={
          <>
            <SourceFlag source={source} />
            <button className="btn" onClick={() => go("decisions")}>Decisions</button>
            <button className="btn" onClick={() => go("evidence")}>Ledger</button>
          </>
        }
      />

      <Panel flush>
        <div style={{ padding: "var(--s4)", borderBottom: "1px solid var(--line)", display: "flex", gap: "var(--s3)", flexWrap: "wrap", alignItems: "center" }}>
          <Chip kind={useLive ? "info" : "ghost"}>{useLive ? "DERIVED LINEAGE" : noRecordedEvents ? "NO LIVE DATA" : "FIXTURE LINEAGE"}</Chip>
          <Chip kind="ghost">SOURCE / CONTEXT</Chip>
          <span className="dim" aria-hidden="true">&rarr;</span>
          <Chip kind="ghost">REQUEST</Chip>
          <span className="dim" aria-hidden="true">&rarr;</span>
          <Chip kind="ghost">DECISION</Chip>
          <span className="dim" aria-hidden="true">&rarr;</span>
          <Chip kind="ghost">EVIDENCE</Chip>
          <span className="dim" aria-hidden="true">&rarr;</span>
          <Chip kind="ghost">HASH CHAIN</Chip>
        </div>
        <div className="lineagewrap">
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--line-3)" />
              </marker>
              <marker id="arrow-prov" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--amber)" />
              </marker>
            </defs>
            {edges.map(([u, v, kind]: any, i: any) => {
              const nu = nodes.find((n: any) => n.id === u);
              const nv = nodes.find((n: any) => n.id === v);
              if (!nu || !nv) return null;
              
              let x1 = nu.x + nu.w;
              let y1 = nu.y + nu.h / 2;
              let x2 = nv.x;
              let y2 = nv.y + nv.h / 2;
              
              if (nu.x === nv.x) {
                x1 = nu.x + nu.w / 2;
                y1 = nu.y + nu.h;
                x2 = nv.x + nv.w / 2;
              }

              const mx = x1 + (x2 - x1) / 2;
              const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;

              const isProv = kind === "prov";
              const isTemp = kind === "temp";
              
              let stroke = isProv ? "var(--amber)" : isTemp ? "var(--line-3)" : "var(--line-2)";
              if (isProv) stroke = "rgba(196, 146, 47, 0.6)";

              return (
                <g key={i}>
                  <path
                    className={"ed" + (isProv ? " prov" : "") + (isTemp ? " temp" : "")}
                    d={d}
                    style={{ stroke }}
                    markerEnd={isProv ? "url(#arrow-prov)" : "url(#arrow)"}
                  />
                  {isProv && <text x={mx} y={y1 - 6} className="lbl" textAnchor="middle" fill="var(--amber)">provides context</text>}
                  {isTemp && <text x={mx} y={y1 - 6} className="lbl" textAnchor="middle">precedes</text>}
                  {kind === "hash" && <text x={mx} y={y1 - 6} className="lbl" textAnchor="middle">hash-chain link</text>}
                </g>
              );
            })}
            
            {nodes.map((n: any) => {
              const isSel = n.ev === selected && selected != null;
              return (
                <g
                  key={n.id}
                  className={"nd" + (n.kind ? " " + n.kind : "") + (isSel ? " sel" : "")}
                  transform={`translate(${n.x},${n.y})`}
                  style={{ cursor: n.ev ? "pointer" : "default" }}
                  onClick={() => { if (n.ev) { select(n.ev); go("evidence"); } }}>
                  <rect width={n.w} height={n.h} rx="4" />
                  <text x={n.w / 2} y={n.h / 2 - 2} textAnchor="middle" dominantBaseline="middle">{n.l}</text>
                  <text x={n.w / 2} y={n.h / 2 + 10} textAnchor="middle" dominantBaseline="middle" className="sub">{n.s}</text>
                </g>
              );
            })}
          </svg>
        </div>
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)" }}>
          <Note kind="info">
            {useLive
              ? "EVIDENCE-BACKED LINEAGE: this view uses recorded event order, trust labels, authorization provider metadata, and SHA-256 linear hash-chain links. It does not claim mathematical causality."
              : noRecordedEvents ? "NO LIVE EVENT RECORDED: this view is intentionally empty until backend evidence exists."
              : "DEMO/FALLBACK: this fixture view is illustrative and is not represented as live backend evidence."}
          </Note>
        </div>
      </Panel>
    </>
  );
}
