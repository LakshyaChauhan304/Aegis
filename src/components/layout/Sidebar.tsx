import React from "react";
import { ROUTE_GROUPS } from "./routes.ts";

export default function Sidebar({ route, setRoute }: any) {
  return (
    <nav className="sidebar">
      <div className="brand">
        <div className="mark" aria-hidden="true" />
        <div className="name">AEGIS</div>
        <div className="role">SECURITY FOR AI AGENTS</div>
      </div>
      
      <div className="navscroll">
        {ROUTE_GROUPS.map((g: any) => (
          <div className="navgroup" key={g.group}>
            <h4>{g.group.toUpperCase()}</h4>
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
        <div className="r"><span>A SAFER</span><span>AGENT FUTURE</span></div>
        <div className="r"><span>AWS</span><span style={{ color: "var(--orange)" }}>SDK READY</span></div>
      </div>
    </nav>
  );
}
