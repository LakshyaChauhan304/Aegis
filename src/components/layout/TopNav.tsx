import React from "react";
import { SESSION, CONTRACT } from "../../data/fixtures.js";

export default function TopNav({ chain }: any) {
  const verified = chain && chain.verified !== false;

  return (
    <div className="authbar">
      <div className="authcell">
        <div className="k">SHA-256 CHAIN</div>
        <div className="v" style={{ color: verified ? "var(--allow)" : "var(--muted)" }}>
          {verified ? "VERIFIED" : "UNVERIFIED"}
        </div>
      </div>
      <div className="authcell">
        <div className="k">CEDAR WASM</div>
        <div className="v" style={{ color: "var(--info)" }}>ACTIVE</div>
      </div>
      <div className="authcell">
        <div className="k">AGENT</div>
        <div className="v sans">{SESSION.agentName}</div>
      </div>
      <div className="authcell">
        <div className="k">SESSION</div>
        <div className="v">{SESSION.id}</div>
      </div>
      <div className="authcell">
        <div className="k">CONTRACT</div>
        <div className="v">{CONTRACT.id}</div>
      </div>
      <div className="authcell">
        <div className="k">RUNTIME AUTHORITY</div>
        <div className="v sans">Cedar / Amazon Verified Permissions</div>
      </div>
    </div>
  );
}
