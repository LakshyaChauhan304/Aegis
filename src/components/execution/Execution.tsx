import React, { useState } from "react";
import PageHead from "../shared/PageHead.tsx";
import Panel from "../shared/Panel.tsx";
import Verdict from "./Verdict.tsx";
import ScopePanel from "./ScopePanel.tsx";
import ActivityStream from "./ActivityStream.tsx";
import ProvenancePanel from "./ProvenancePanel.tsx";
import BoundaryVisual from "../viz/BoundaryVisual.tsx";
import aegisApi from "../../data/aegisApi.ts";
import { SESSION } from "../../data/fixtures.js";
import DecisionChip from "../shared/DecisionChip.tsx";
import TrustChip from "../shared/TrustChip.tsx";
import StateChip from "../shared/StateChip.tsx";
import Note from "../shared/Note.tsx";

export default function Execution({ events, idx, go, select, refresh }: any) {
  const visible = events.slice(0, idx + 1);
  const denied = visible.find((e: any) => e.decision === "DENY");
  const untrusted = visible.find((e: any) => e.trust === "UNTRUSTED_EXTERNAL");
  const touched = new Set(visible.map((e: any) => e.resource));
  const current = events[idx] || events[events.length - 1];

  const [runningHero, setRunningHero] = useState(false);
  const [heroStatus, setHeroStatus] = useState<string | null>(null);
  const [heroResults, setHeroResults] = useState<any[]>([]);

  const runLiveHeroFlow = async () => {
    setRunningHero(true);
    setHeroResults([]);
    const steps = [
      { label: "package.json", resource: "package.json", trust: "TRUSTED" },
      { label: "package-lock.json", resource: "package-lock.json", trust: "TRUSTED" },
      { label: "axios README", resource: "node_modules/axios/README.md", trust: "UNTRUSTED_EXTERNAL" },
      { label: ".env", resource: ".env", trust: "UNTRUSTED_EXTERNAL" },
    ];
    try {
      for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i];
        setHeroStatus(`Step ${i + 1}/4: ${step.label}`);
        const response = await aegisApi.invoke("fs", "fs:read", step.resource, step.trust);
        setHeroResults((prev) => [...prev, { ...step, ...response }]);
        if (refresh) await refresh();
      }

      setHeroStatus("Hero flow complete. Open Decisions, Evidence, Lineage, Replay, or Investigations for recorded proof.");
    } catch (e: any) {
      setHeroStatus(`Execution error: ${e.message}`);
    } finally {
      setRunningHero(false);
    }
  };

  return (
    <>
      <PageHead
        title="Agent Execution"
        desc="DevFix is a reference agent running through the local Aegis PEP. This phase verifies filesystem authorization only; shell and npm audit execution are not exposed."
        actions={
          <>
            <button
              className="btn primary"
              onClick={runLiveHeroFlow}
              disabled={runningHero}
              style={{ fontWeight: 600 }}>
              {runningHero ? (heroStatus || "Executing PEP...") : "Run Live Hero Flow"}
            </button>
            <button className="btn" onClick={() => go("contracts")}>Task contract</button>
            <button className="btn" onClick={() => go("recorder")}>Flight recorder</button>
          </>
        }
      />

      {(heroStatus || heroResults.length > 0) && (
        <Panel flush style={{ marginBottom: "var(--s4)", padding: "10px 16px" }}>
          <div className="mono" style={{ fontSize: 12, color: "var(--amber)" }}>
            {heroStatus}
          </div>
          {heroResults.length > 0 && (
            <div className="tablescroll" style={{ marginTop: 10 }}>
              <table className="dt">
                <thead>
                  <tr>
                    <th>STEP</th>
                    <th>RESOURCE</th>
                    <th>TRUST</th>
                    <th>DECISION</th>
                    <th>HTTP</th>
                    <th>EXECUTION</th>
                    <th>BYTES RETURNED</th>
                    <th>PROVIDER</th>
                    <th>EVENT</th>
                  </tr>
                </thead>
                <tbody>
                  {heroResults.map((r, i) => (
                    <tr key={`${r.resource}-${i}`}>
                      <td className="m dim">{i + 1}</td>
                      <td className="m">{r.resource}</td>
                      <td className="m">{r.trust || "UNKNOWN"}</td>
                      <td className="m" style={{ color: r.decision?.decision === "DENY" ? "var(--deny)" : "var(--allow)" }}>
                        {r.decision?.decision || "UNKNOWN"}
                      </td>
                      <td className="m">{r.status || "UNKNOWN"}</td>
                      <td className="m">{r.executionState || "UNKNOWN"}</td>
                      <td className="m">{r.bytesReturned == null ? "UNKNOWN" : r.bytesReturned}</td>
                      <td className="m dim">{r.authProvider || "UNKNOWN"}</td>
                      <td className="m dim">{r.eventId || "UNKNOWN"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      <Panel flush style={{ marginBottom: "var(--s5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s5)", padding: "var(--s4)", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-.01em" }}>{SESSION.agentName}</div>
            <div className="muted" style={{ fontSize: 12 }}>{SESSION.agentRole} &middot; reference agent</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: "var(--s5)", flexWrap: "wrap" }}>
            <div>
              <div className="mono dim" style={{ fontSize: 9.5, letterSpacing: ".12em" }}>SESSION</div>
              <div className="mono" style={{ fontSize: 12.5 }}>{SESSION.id}</div>
            </div>
            <div>
              <div className="mono dim" style={{ fontSize: 9.5, letterSpacing: ".12em" }}>TASK CONTRACT</div>
              <div className="mono" style={{ fontSize: 12.5 }}>{SESSION.contractId}</div>
            </div>
            <div>
              <div className="mono dim" style={{ fontSize: 9.5, letterSpacing: ".12em" }}>AUTHORITY</div>
              <div className="mono" style={{ fontSize: 12.5, color: "var(--info)" }}>DECLARED SCOPE</div>
            </div>
            <div>
              <div className="mono dim" style={{ fontSize: 9.5, letterSpacing: ".12em" }}>STATE</div>
              <div className="mono" style={{ fontSize: 12.5, color: denied ? "var(--deny)" : "var(--fg)" }}>
                {denied ? "HALTED AT DENY" : "RUNNING"}
              </div>
            </div>
          </div>
        </div>
        <BoundaryVisual event={events[idx]} height={200} compact />
      </Panel>

      <Panel title="REQUEST AUTHORIZATION PATH" flush style={{ marginBottom: "var(--s5)" }}>
        <div className="auth-path">
          {[
            ["REQUEST", current?.resource || "NOT AVAILABLE", <TrustChip t={current?.trust || "UNKNOWN"} />],
            ["TASK CONTRACT", current?.sessionId ? "NOT RECORDED" : SESSION.contractId, <StateChip s={current?.sessionId ? "UNAVAILABLE" : "FIXTURE"} />],
            ["CONTEXT / PROVENANCE", current?.trust || "UNKNOWN", <span className="mono dim">origin travels with request</span>],
            ["CEDAR", current?.authProvider || "LOCAL / FALLBACK", <span className="mono dim">runtime policy gate</span>],
            ["DECISION", current?.decision || "UNKNOWN", <DecisionChip d={current?.decision} />],
            ["PEP / EXECUTOR", current?.decision === "DENY" ? "STOP BEFORE EXECUTOR" : current?.execution || "UNKNOWN", <StateChip s={current?.decision === "DENY" ? "NOT_EXECUTED" : current?.execution || "UNAVAILABLE"} />],
          ].map(([label, value, right]: any) => {
            const inactiveExecutor = label === "PEP / EXECUTOR" && current?.decision === "DENY";
            return (
              <div
                key={label}
                className={"auth-step" + (inactiveExecutor ? " stop" : "")}>
                <div className="l">{label}</div>
                <div className="n mono" style={{ wordBreak: "break-word" }}>{value}</div>
                <div className="s" style={{ marginTop: 8 }}>{right}</div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)" }}>
          <Note kind={current?.decision === "DENY" ? "deny" : "info"}>
            {current?.decision === "DENY"
              ? "DENY path: Cedar returns a denial at the gateway, and the executor remains inactive."
              : "ALLOW path: the protected executor is reached only after the policy decision."}
          </Note>
        </div>
      </Panel>

      {denied ? (
        <div style={{ marginBottom: "var(--s5)" }}>
          <Verdict ev={denied} go={go} select={select} />
        </div>
      ) : null}

      <div className="grid g2" style={{ marginBottom: "var(--s5)" }}>
        <ScopePanel touched={touched} breached={denied ? denied.resource : null} />
        <ActivityStream events={events} idx={idx} go={go} select={select} />
      </div>

      <ProvenancePanel event={untrusted} />
    </>
  );
}
