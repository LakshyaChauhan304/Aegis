import React from "react";
import PageHead from "../shared/PageHead.tsx";
import Panel from "../shared/Panel.tsx";
import StateChip from "../shared/StateChip.tsx";
import BoundaryVisual from "../viz/BoundaryVisual.tsx";
import { SESSION } from "../../data/fixtures.js";

export default function Overview({ events, go }: any) {
  const allow = events.filter((e: any) => e.decision === "ALLOW").length;
  const deny = events.filter((e: any) => e.decision === "DENY").length;
  const untrusted = events.filter((e: any) => e.trust === "UNTRUSTED_EXTERNAL").length;

  return (
    <>
      <PageHead
        title="Aegis Overview"
        desc="Aegis controls and accounts for autonomous AI actions through deterministic policy enforcement and cryptographically linked evidence."
      />

      <Panel title="RUNTIME ARCHITECTURE &middot; THE BOUNDARY IS THE PEP" flush>
        <BoundaryVisual height={320} />
      </Panel>

      <div className="grid g4" style={{ marginBottom: "var(--s5)" }}>
        <button onClick={() => go("agents")} style={{ textAlign: "left" }}>
          <Panel flush>
            <div style={{ padding: "16px 20px" }}>
              <div className="bigstat">
                <div className="n">1</div>
                <div className="l">ACTIVE AGENT</div>
              </div>
            </div>
            <div style={{ borderTop: "1px solid var(--line)", padding: "10px 20px", fontSize: 11.5, color: "var(--muted)" }}>
              {SESSION.agentName} &middot; {SESSION.agentRole}
            </div>
          </Panel>
        </button>

        <button onClick={() => go("evidence")} style={{ textAlign: "left" }}>
          <Panel flush>
            <div style={{ padding: "16px 20px" }}>
              <div className="bigstat">
                <div className="n">{events.length}</div>
                <div className="l">EVIDENCE EVENTS</div>
              </div>
            </div>
            <div style={{ borderTop: "1px solid var(--line)", padding: "10px 20px", fontSize: 11.5, color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
              <span>SHA-256 chain</span>
              <span style={{ color: "var(--allow)" }}>VERIFIED</span>
            </div>
          </Panel>
        </button>

        <button onClick={() => go("decisions")} style={{ textAlign: "left" }}>
          <Panel flush>
            <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
              <div className="bigstat">
                <div className="n allow">{allow}</div>
                <div className="l">ALLOW</div>
              </div>
              <div className="bigstat">
                <div className="n deny">{deny}</div>
                <div className="l">DENY</div>
              </div>
            </div>
            <div style={{ borderTop: "1px solid var(--line)", padding: "10px 20px", fontSize: 11.5, color: "var(--muted)" }}>
              Recorded authorization decisions
            </div>
          </Panel>
        </button>

        <button onClick={() => go("execution")} style={{ textAlign: "left" }}>
          <Panel flush>
            <div style={{ padding: "16px 20px" }}>
              <div className="bigstat">
                <div className="n" style={{ color: "var(--amber)" }}>{untrusted}</div>
                <div className="l">UNTRUSTED INPUTS</div>
              </div>
            </div>
            <div style={{ borderTop: "1px solid var(--line)", padding: "10px 20px", fontSize: 11.5, color: "var(--muted)" }}>
              Third-party context ingested
            </div>
          </Panel>
        </button>
      </div>
      
      <div className="grid g2">
        <Panel title="SYSTEM STATUS" flush>
          <div className="tablescroll">
            <table className="dt">
              <tbody>
                <tr>
                  <td>Backend enforcement (PEP)</td>
                  <td><StateChip s="VERIFIED" /></td>
                </tr>
                <tr>
                  <td>Cedar policy evaluation</td>
                  <td><StateChip s="VERIFIED" /></td>
                </tr>
                <tr>
                  <td>AWS Bedrock Integration</td>
                  <td><StateChip s="SDK_READY" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="CORE PRINCIPLES">
          <ul style={{ margin: 0, paddingLeft: 20, color: "var(--muted)", lineHeight: 1.7, fontSize: 13 }}>
            <li><strong style={{ color: "var(--fg)" }}>Authorization is absolute.</strong> The agent cannot override Cedar / AVP policy enforcement.</li>
            <li><strong style={{ color: "var(--fg)" }}>Enforcement is architectural.</strong> The gateway (PEP) wraps the tool. The tool cannot be reached if the policy denies it.</li>
            <li><strong style={{ color: "var(--fg)" }}>Evidence is cryptographic.</strong> Every decision is chained. Modification breaks the chain.</li>
            <li><strong style={{ color: "var(--fg)" }}>AI is not an authority.</strong> Bedrock analyzes the evidence after the fact. It holds zero runtime authorization capability.</li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
