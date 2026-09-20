import React from "react";
import { SESSION, CONTRACT } from "../../data/fixtures.js";

export default function TopNav({ activeRun }: any) {
  const sessionId = activeRun?.sessionId || SESSION.id;
  const agentName = activeRun?.agentId || SESSION.agentName;
  const contractId = activeRun?.contractId || CONTRACT.id;
  return (
    <div className="authbar">
      <div className="authcell">
        <div className="k">LIVE DEMO SESSION</div>
        <div className="v">{sessionId}</div>
      </div>
      <div className="authcell">
        <div className="k">REFERENCE AGENT</div>
        <div className="v sans">{agentName}</div>
      </div>
      <div className="authcell">
        <div className="k">TASK CONTRACT</div>
        <div className="v">{contractId}</div>
      </div>
      <div className="authcell">
        <div className="k">RUNTIME AUTHORITY</div>
        <div className="v sans">Cedar / Amazon Verified Permissions</div>
      </div>
    </div>
  );
}
