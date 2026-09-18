import React from "react";
import { ROUTE_GROUPS } from "./routes.ts";

const PILLAR_COLORS: Record<string, string> = {
  Control: "var(--info)",
  Record: "var(--allow)",
  Investigate: "var(--amber)",
  System: "var(--dim)",
};

export default function Sidebar({ route, setRoute }: any) {
  return (
    <nav className="sidebar">
      <div className="brand">
        <div className="mark" aria-hidden="true" />
        <div className="name">AEGIS</div>
        <div className="role">SECURE AGENT PLATFORM</div>
      </div>
      
      <div className="navscroll">
        {ROUTE_GROUPS.map((g: any) => (
          <div className="navgroup" key={g.group}>
            <h4 style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: PILLAR_COLORS[g.group] || "var(--dim)",
                flexShrink: 0,
              }}></span>
              {g.group.toUpperCase()}
              <span className="mono" style={{
                fontSize: 9,
                color: "var(--dim)",
                marginLeft: "auto",
                background: "var(--panel-3)",
                padding: "1px 5px",
                borderRadius: 2,
              }}>{g.items.length}</span>
            </h4>
            {g.items.map((i: any) => (
              <button
                key={i.id}
                className="navitem"
                aria-current={route === i.id ? "page" : undefined}
                onClick={() => setRoute(i.id)}>
                {i.label}
              </button>
            ))}
          </div>
        ))}
      </div>
      
      <div className="sidefoot">
        <div className="r"><span>UI HANDOFF</span><span>v1.0.0</span></div>
        <div className="r"><span>AWS INTEGRATION</span><span style={{ color: "var(--info)" }}>SDK READY</span></div>
      </div>
    </nav>
  );
}
