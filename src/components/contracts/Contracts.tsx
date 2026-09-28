import React from "react";
import PageHead from "../shared/PageHead.tsx";
import Panel from "../shared/Panel.tsx";
import Chip from "../shared/Chip.tsx";
import KV from "../shared/KV.tsx";
import Note from "../shared/Note.tsx";
import SourceFlag from "../shared/SourceFlag.tsx";

function ScopeList({ items, kind }: any) {
  const glyph = kind === "deny" ? "\u2715" : kind === "allow" ? "\u2713" : "\u00b7";
  const colour = kind === "deny" ? "var(--deny)" : kind === "allow" ? "var(--allow)" : "var(--dim)";
  return (
    <div>
      {items.map((i: any) => (
        <div
          key={i}
          className="mono"
          style={{ fontSize: 11.5, padding: "5px 0", borderBottom: "1px solid var(--line)", display: "flex", gap: 10 }}>
          <span aria-hidden="true" style={{ color: colour }}>{glyph}</span>
          {i}
        </div>
      ))}
    </div>
  );
}

export default function Contracts({ go, contract }: any) {
  const live = !!contract;
  const c = live ? {
    id: contract.contractId, purpose: contract.purpose, agent: contract.agentId, agentId: contract.agentId,
    session: contract.session?.allowedPrefixes?.join(", ") || "PREFIX-BOUND", issuedAt: "NOT AVAILABLE",
    expiresAt: "NOT AVAILABLE", ttl: "NOT AVAILABLE", deployment: "LIVE BACKEND REGISTRY",
    tools: contract.scope?.allowed?.map((entry: any) => `${entry.tool} ${entry.action}`) || [],
    network: [], networkDeny: [], fsAllow: contract.scope?.allowed?.map((entry: any) => entry.resource) || [],
    fsDeny: contract.scope?.deniedResources || [], signatureAlg: "NOT IMPLEMENTED", signatureKid: "NOT IMPLEMENTED",
  } : {
    id: "NOT AVAILABLE", purpose: "Task contract unavailable", agent: "NOT AVAILABLE", agentId: "NOT AVAILABLE",
    session: "NOT AVAILABLE", issuedAt: "NOT AVAILABLE", expiresAt: "NOT AVAILABLE", ttl: "NOT AVAILABLE",
    deployment: "NOT VERIFIED", tools: [], network: [], networkDeny: [], fsAllow: [], fsDeny: [],
    signatureAlg: "NOT IMPLEMENTED", signatureKid: "NOT IMPLEMENTED",
  };

  return (
    <>
      <PageHead
        title="Task Contracts"
        desc="This surface shows the task contract loaded from the Aegis backend. Signed contract enforcement remains explicitly unverified."
        actions={
          <>
            <SourceFlag source={live ? "LIVE" : "UNAVAILABLE"} />
            <button className="btn" onClick={() => go("execution")}>Agent execution</button>
            <button className="btn" onClick={() => go("policies")}>Policy</button>
          </>
        }
      />

      <Panel flush style={{ marginBottom: "var(--s5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s5)", padding: "var(--s4)", flexWrap: "wrap" }}>
          <div>
            <div className="mono" style={{ fontSize: 15 }}>{c.id}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{c.purpose}</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Chip kind="ghost">{live ? "LIVE SCOPE" : "NOT AVAILABLE"}</Chip>
            <Chip kind="warn">SIGNATURE NOT VERIFIED</Chip>
            <Chip kind="ghost">TTL {c.ttl}</Chip>
            <Chip kind="info">SESSION {c.session}</Chip>
          </div>
        </div>
      </Panel>

      <div className="grid g3">
        <Panel title="IDENTITY & LIFETIME">
          <KV
            rows={[
              ["AGENT", c.agent],
              ["AGENT ID", c.agentId],
              ["SESSION", c.session],
              ["ISSUED", c.issuedAt.slice(11, 23) + "Z"],
              ["EXPIRES", c.expiresAt.slice(11, 23) + "Z"],
              ["TTL", c.ttl],
              ["DEPLOYMENT", <span style={{ color: "var(--amber)" }}>{c.deployment}</span>],
            ]}
          />
        </Panel>

        <Panel title="PERMITTED TOOLS">
          <ScopeList items={c.tools} kind="allow" />
          <div className="mono dim" style={{ fontSize: 9.5, letterSpacing: ".12em", margin: "16px 0 6px" }}>NETWORK SCOPE</div>
          <ScopeList items={c.network} kind="allow" />
          <ScopeList items={c.networkDeny} kind="deny" />
          <div className="mono dim" style={{ fontSize: 9.5, letterSpacing: ".12em", margin: "16px 0 6px" }}>TRUST CONSTRAINTS</div>
          <ScopeList items={["UNTRUSTED_EXTERNAL is carried as context", "Trust does not imply malicious intent"]} kind="info" />
        </Panel>

        <Panel title="FILESYSTEM SCOPE">
          <div className="mono dim" style={{ fontSize: 9.5, letterSpacing: ".12em", marginBottom: 6 }}>AUTHORIZED</div>
          <ScopeList items={c.fsAllow} kind="allow" />
          <div className="mono dim" style={{ fontSize: 9.5, letterSpacing: ".12em", margin: "16px 0 6px" }}>NOT AUTHORIZED</div>
          <ScopeList items={c.fsDeny} kind="deny" />
        </Panel>
      </div>

      <Panel title="SIGNATURE STATUS">
        <div style={{ display: "flex", gap: "var(--s6)", flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <div className="mono dim" style={{ fontSize: 9.5, letterSpacing: ".12em" }}>STATUS</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--muted)" }}>NOT IMPLEMENTED</div>
          </div>
          <div>
            <div className="mono dim" style={{ fontSize: 9.5, letterSpacing: ".12em" }}>TARGET ALGORITHM</div>
            <div className="mono" style={{ fontSize: 13 }}>{c.signatureAlg}</div>
          </div>
          <div>
            <div className="mono dim" style={{ fontSize: 9.5, letterSpacing: ".12em" }}>TARGET KEY ID</div>
            <div className="mono" style={{ fontSize: 13 }}>{c.signatureKid}</div>
          </div>
          <div style={{ flex: "1 1 300px" }}>
            <Note>
              KMS-backed signed Task Contract verification is not implemented in this phase.
              Contract scope above is read from the backend registry.
            </Note>
          </div>
        </div>
      </Panel>

      <Panel title="CONTRACT TO POLICY RELATIONSHIP">
        <div style={{ display: "flex", gap: "var(--s3)", alignItems: "center", flexWrap: "wrap" }}>
          <Chip kind="ghost">TASK CONTRACT · FIXTURE</Chip>
          <span className="dim" aria-hidden="true">&rarr;</span>
          <Chip kind="info">CEDAR POLICY · LIVE LOCAL SOURCE</Chip>
          <span className="dim" aria-hidden="true">&rarr;</span>
          <Chip kind="ghost">PER-REQUEST DECISION</Chip>
          <button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => go("policies")}>Open policy</button>
        </div>
        <div style={{ marginTop: 12 }}>
          <Note kind="warn">
            The frontend can show the intended relationship, but the live backend does not expose
            a cryptographically verified contract binding on each event.
          </Note>
        </div>
      </Panel>
    </>
  );
}
