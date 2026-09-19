import React, { useEffect, useState } from "react";
import PageHead from "../shared/PageHead.tsx";
import Panel from "../shared/Panel.tsx";
import KV from "../shared/KV.tsx";
import Note from "../shared/Note.tsx";
import SourceFlag from "../shared/SourceFlag.tsx";
import aegisApi from "../../data/aegisApi.ts";
import EvaluationChain from "../decisions/EvaluationChain.tsx";
import DecisionChip from "../shared/DecisionChip.tsx";
import TrustChip from "../shared/TrustChip.tsx";
import { SESSION } from "../../data/fixtures.js";

export default function Policies({ go, events = [], selected }: any) {
  const [policy, setPolicy] = useState<any>(null);
  const ev = events.find((event: any) => event.id === selected) || events[events.length - 1];

  useEffect(() => {
    let active = true;
    aegisApi.getPolicy().then((result) => {
      if (active) setPolicy(result);
    });
    return () => { active = false; };
  }, []);

  const p = policy || {
    source: "UNAVAILABLE",
    file: "server/policies/devfix.cedar",
    hash: "",
    hashAlgorithm: "SHA-256",
    sourceText: "Loading current Cedar policy...",
    note: "Loading policy from backend.",
  };

  return (
    <>
      <PageHead
        title="Policies"
        desc="The current runtime policy shown here is the actual local Cedar source loaded by the Aegis PEP."
        actions={
          <>
            <SourceFlag source={p.source} />
            <button className="btn" onClick={() => go("decisions")}>Decisions</button>
          </>
        }
      />

      <div className="grid g3">
        <Panel title="ACTIVE SET">
          <KV
            rows={[
              ["FILE", p.file],
              ["AUTHORITY", p.policyAuthority || "local-cedar"],
              ["STATUS", <span style={{ color: "var(--info)" }}>{p.source}</span>],
              ["HASH ALG", p.hashAlgorithm],
              ["HASH", <span className="hash">{p.hash}</span>],
              ["NOTE", p.note],
            ]}
          />
        </Panel>
        <Panel title="CURRENT REQUEST CONTEXT">
          <KV
            rows={[
              ["PRINCIPAL", ev?.agentId || SESSION.agentId],
              ["ACTION", ev?.action || "NOT AVAILABLE"],
              ["RESOURCE", ev?.resource || "NOT AVAILABLE"],
              ["CONTEXT / TRUST", ev ? <TrustChip t={ev.trust} /> : "NOT AVAILABLE"],
              ["CONTRACT", ev?.sessionId ? "NOT AVAILABLE" : SESSION.contractId],
              ["CEDAR RESULT", ev ? <DecisionChip d={ev.decision} /> : "NOT AVAILABLE"],
              ["ARGUMENTS", "NOT EXPOSED BY BACKEND"],
            ]}
          />
        </Panel>
        <div style={{ gridColumn: "1 / -1" }}>
          <Panel title={"CEDAR SOURCE \u00b7 " + p.file} flush>
            <div className="policy-source">
              <pre className="cedar">{p.sourceText}</pre>
            </div>
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)" }}>
              <Note kind="info">
                This view displays the current Cedar policy loaded by the backend. It does not use
                the fixture policy as the authoritative runtime representation.
              </Note>
            </div>
          </Panel>
        </div>
      </div>

      {ev ? (
        <Panel title="FRONTEND-DERIVED AUTHORIZATION EXPLANATION" flush>
          <div style={{ padding: "var(--s4)" }}>
            <EvaluationChain ev={ev} />
          </div>
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)" }}>
            <Note>
              This explanation is derived from the selected event fields. The backend exposes the
              live Cedar policy source and final event reason, but not full Cedar diagnostics.
            </Note>
          </div>
        </Panel>
      ) : null}
    </>
  );
}
