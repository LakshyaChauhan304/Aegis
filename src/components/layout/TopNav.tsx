import React from "react";
export default function TopNav({ activeRun }: any) {
  const sessionId = activeRun?.sessionId || "NO ACTIVE LIVE SESSION";
  const agentName = activeRun?.agentId || "NOT AVAILABLE";
  const contractId = activeRun?.contractId || "NOT AVAILABLE";
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
