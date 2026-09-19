import React from "react";
import { SESSION, CONTRACT } from "../../data/fixtures.js";

export default function TopNav() {
  return (
    <div className="authbar">
      <div className="authcell">
        <div className="k">LIVE DEMO SESSION</div>
        <div className="v">{SESSION.id}</div>
      </div>
      <div className="authcell">
        <div className="k">REFERENCE AGENT</div>
        <div className="v sans">{SESSION.agentName}</div>
      </div>
      <div className="authcell">
        <div className="k">TASK CONTRACT</div>
        <div className="v">{CONTRACT.id}</div>
      </div>
      <div className="authcell">
        <div className="k">RUNTIME AUTHORITY</div>
        <div className="v sans">Cedar / Amazon Verified Permissions</div>
      </div>
    </div>
  );
}
