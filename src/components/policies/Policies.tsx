import React, { useEffect, useState } from "react";
import PageHead from "../shared/PageHead.tsx";
import Panel from "../shared/Panel.tsx";
import KV from "../shared/KV.tsx";
import Note from "../shared/Note.tsx";
import SourceFlag from "../shared/SourceFlag.tsx";
import aegisApi from "../../data/aegisApi.ts";

export default function Policies({ go }: any) {
  const [policy, setPolicy] = useState<any>(null);

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
        <div style={{ gridColumn: "2 / -1" }}>
          <Panel title={"CEDAR SOURCE \u00b7 " + p.file} flush>
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", top: 12, right: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--deny-bg)", padding: "4px 8px", borderRadius: 4, border: "1px solid var(--deny)" }}>
                  <div style={{ width: 6, height: 6, background: "var(--deny)", borderRadius: "50%" }}></div>
                  <span className="mono" style={{ fontSize: 10, color: "var(--deny)", letterSpacing: "0.05em", fontWeight: 600 }}>policy_1: ACTIVE DENY (.env)</span>
                </div>
              </div>
              <pre className="cedar" style={{ margin: 0, padding: "var(--s5)", overflowX: "auto" }} dangerouslySetInnerHTML={{ 
                __html: (p.sourceText || "")
                  .replace(/permit|forbid|when|unless/g, '<span style="color: var(--info); font-weight: 600">$&</span>')
                  .replace(/principal|action|resource|context/g, '<span style="color: var(--allow); font-weight: 600">$&</span>')
                  .replace(/==|in|!/g, '<span style="color: var(--dim); font-weight: 600">$&</span>')
                  .replace(/policy[0-9_a-zA-Z]+/g, '<span style="color: var(--amber); font-weight: 600">$&</span>')
                  .replace(/"[^"]*"/g, '<span style="color: #a8cf82">$&</span>')
                  .replace(/\/\/.*/g, '<span style="color: var(--muted)">$&</span>') 
              }} />
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
    </>
  );
}
