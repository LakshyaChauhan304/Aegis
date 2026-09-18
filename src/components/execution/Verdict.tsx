import React from "react";
import { fmtT } from "../../data/fixtures.js";

export default function Verdict({ ev, go, select }: any) {
  const isDeny = ev?.decision === "DENY";
  const bytesDisplay = ev?.bytes === 0 ? "0 BYTES (NO RESULT BODY)" : ev?.bytes != null ? `${ev.bytes} BYTES` : "0 BYTES";

  return (
    <div className="verdict verdict-enhanced" role="alert" aria-label="Security decision: denied">
      <div className="verdict-banner-strip">
        <span className="verdict-tag">POLICY ENFORCEMENT POINT &bull; INVARIANT PRESERVED</span>
        <span className="verdict-time mono dim">{fmtT(ev.t || 0)}</span>
      </div>

      <div className="verdict-main-row">
        <div className="verdict-word-group">
          <div className="word">
            <span className="x" aria-hidden="true">&#10005;</span>
            <span>DENIED</span>
          </div>
          <div className="verdict-subclaim mono">
            ACTION BLOCKED AT GATEWAY BEFORE PROTECTED TOOL INVOCATION
          </div>
        </div>

        <div className="verdict-badge-box">
          <div className="badge-k mono">PROTECTED TARGET</div>
          <div className="badge-v mono text-glow">{ev.resource || ".env"}</div>
          <div className="badge-sub mono dim">{ev.tool || "fs"}:{ev.action || "fs:read"}</div>
        </div>
      </div>

      <div className="verdict-proof-quad">
        <div className="proof-quad-cell">
          <div className="k mono">DETERMINISTIC VERDICT</div>
          <div className="v mono txt-deny font-bold">DENY</div>
          <div className="sub-note mono">Cedar Policy Engine</div>
        </div>

        <div className="proof-quad-cell">
          <div className="k mono">GATEWAY RESPONSE</div>
          <div className="v mono txt-deny font-bold">HTTP 403</div>
          <div className="sub-note mono">Forbidden (Fail-Closed)</div>
        </div>

        <div className="proof-quad-cell">
          <div className="k mono">TOOL EXECUTION</div>
          <div className="v mono txt-deny font-bold">NOT EXECUTED</div>
          <div className="sub-note mono">Filesystem Never Touched</div>
        </div>

        <div className="proof-quad-cell">
          <div className="k mono">DATA EXPOSED</div>
          <div className="v mono txt-allow font-bold">{bytesDisplay}</div>
          <div className="sub-note mono">Zero Information Leaked</div>
        </div>
      </div>

      <div className="verdict-authority-box">
        <div className="auth-line">
          <span className="auth-lead mono dim">POLICY REASON:</span>
          <span className="auth-val mono">{ev.reason || "Denied by local policy (forbid rule active)"}</span>
        </div>
        <div className="auth-line">
          <span className="auth-lead mono dim">EVIDENCE ANCHOR:</span>
          <span className="auth-val mono dim">{ev.id || ev.eventId} &bull; Tamper-evident SHA-256 Ledger link</span>
        </div>
      </div>

      <div className="verdict-cta-row">
        <button className="btn primary" onClick={() => { if (select) select(ev.id); if (go) go("decisions"); }}>
          Inspect Policy Reason
        </button>
        <button className="btn" onClick={() => { if (select) select(ev.id); if (go) go("evidence"); }}>
          Examine Hash Chain Evidence
        </button>
        <button className="btn" onClick={() => { if (go) go("lineage"); }}>
          Trace Evidence Lineage
        </button>
        <button className="btn" onClick={() => { if (go) go("investigations"); }}>
          Post-Hoc Forensic Synthesis
        </button>
      </div>
    </div>
  );
}
