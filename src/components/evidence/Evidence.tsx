import React from "react";
import PageHead from "../shared/PageHead.tsx";
import Panel from "../shared/Panel.tsx";
import KV from "../shared/KV.tsx";
import Note from "../shared/Note.tsx";
import DecisionChip from "../shared/DecisionChip.tsx";
import TrustChip from "../shared/TrustChip.tsx";
import StateChip from "../shared/StateChip.tsx";
import SourceFlag from "../shared/SourceFlag.tsx";
import ChainLink from "./ChainLink.tsx";
import { short, SESSION } from "../../data/fixtures.js";
import { eventTraceId } from "../../data/controlPlane.ts";

export default function Evidence({ events, selected, select, go, source, chain }: any) {
  const safeEvents = Array.isArray(events) ? events : [];
  const ev = safeEvents.find((e: any) => e.id === selected) || safeEvents[safeEvents.length - 1];
  const verified = chain && chain.verified !== false;
  const okCount = chain && chain.ok != null ? chain.ok : safeEvents.length;
  const total = chain && chain.total != null ? chain.total : safeEvents.length;

  if (!ev) {
    return (
      <>
        <PageHead title="Evidence Ledger" desc="Security-relevant events recorded around every agent action, linked with a SHA-256 evidence hash chain." actions={<SourceFlag source={source} />} />
        <Panel title="LEDGER">
          <Note kind="info">NO LIVE EVENT RECORDED</Note>
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Evidence Ledger"
        desc="Security-relevant events recorded around every agent action, linked with a SHA-256 evidence hash chain."
        actions={
          <>
            <SourceFlag source={source} />
            <button className="btn" onClick={() => go("decisions")}>Decision</button>
            <button className="btn" onClick={() => go("lineage")}>Lineage</button>
          </>
        }
      />

      <Panel flush style={{ marginBottom: "var(--s5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s6)", padding: "var(--s4)", flexWrap: "wrap" }}>
          <div>
            <div className="mono dim" style={{ fontSize: 9.5, letterSpacing: ".12em" }}>SHA-256 EVIDENCE HASH CHAIN</div>
            <div style={{ fontSize: 20, fontWeight: 600, marginTop: 2 }}>
              {okCount} / {total}{" "}
              <span style={{ color: verified ? "var(--allow)" : "var(--muted)", fontSize: 16 }}>
                {verified ? "VERIFIED" : "UNVERIFIED"}
              </span>
            </div>
          </div>
          <div>
            <div className="mono dim" style={{ fontSize: 9.5, letterSpacing: ".12em" }}>VERIFICATION</div>
            <div style={{ marginTop: 4 }}><StateChip s={verified ? "VERIFIED" : "UNAVAILABLE"} /></div>
          </div>
          <div>
            <div className="mono dim" style={{ fontSize: 9.5, letterSpacing: ".12em" }}>SEAL TARGET</div>
            <div className="mono" style={{ fontSize: 12, marginTop: 4 }}>
              S3 Object Lock Compliance Mode <span className="dim">&middot; SDK READY</span>
            </div>
          </div>
          <div style={{ flex: "1 1 260px", minWidth: 220 }}>
            <Note>
              The local ledger is append-only in process. It is not durable storage, and Aegis
              only claims tamper-resistant archival after a verified Object Lock write.
            </Note>
          </div>
        </div>
      </Panel>

      <Panel title="LEDGER" flush>
        <div className="tablescroll is-scrollable">
          <div className="tablehint">SCROLL FOR HASHES · EVENT ID STAYS PINNED</div>
          <table className="dt control-table">
            <thead>
              <tr>
              <th>SEQ</th><th className="sticky-key">EVENT</th><th>T+</th><th>SESSION</th><th>AGENT</th><th>ACTION</th><th>RESOURCE</th>
                <th>CONTEXT</th><th>DECISION</th><th>EXECUTION</th><th>PARENT HASH</th><th>EVENT HASH</th><th>CHAIN</th>
              </tr>
            </thead>
            <tbody>
              {safeEvents.map((e: any) => (
                <tr
                  key={e.id}
                  className={"clickable" + (e.id === ev.id ? " sel" : "")}
                  onClick={() => select(e.id)}>
                  <td className="m dim">{String(e.seq).padStart(3, "0")}</td>
                  <td className="m sticky-key">{e.id}</td>
                  <td className="m dim">{e.t.toFixed(3)}</td>
                  <td className="m dim">{e.sessionId || (source === "FIXTURE" ? SESSION.id : "NOT AVAILABLE")}</td>
                  <td className="m dim">{e.agentId || (source === "FIXTURE" ? SESSION.agentId : "NOT AVAILABLE")}</td>
                  <td className="m">{e.action}</td>
                  <td className="m">{e.resource}</td>
                  <td className="m">
                    {e.trust === "UNTRUSTED_EXTERNAL"
                      ? <span style={{ color: "var(--amber)" }}>&#9888; untrusted</span>
                      : <span className="dim">{e.trust.toLowerCase()}</span>}
                  </td>
                  <td><DecisionChip d={e.decision} /></td>
                  <td className="m">{e.execution || "NOT AVAILABLE"}</td>
                  <td className="m dim">{e.prev ? short(e.prev) : "genesis"}</td>
                  <td className="m">{short(e.curr)}</td>
                  <td className="m" style={{ color: "var(--allow)" }}>&#10003;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <PageHead
        title={"Evidence detail \u00b7 " + eventTraceId(ev)}
        actions={
          <>
            <button className="btn" onClick={() => go("decisions")}>View decision</button>
            <button className="btn" onClick={() => go("lineage")}>View lineage</button>
            <button className="btn" onClick={() => go("recorder")}>Replay</button>
            <button className="btn" onClick={() => go("investigations")}>Investigate</button>
          </>
        }
      />

      <div className="grid g2">
        <Panel title="RECORDED EVENT">
          <KV
            rows={[
              ["EVENT ID", ev.id],
              ["TIMESTAMP", ev.timestamp || SESSION.startedAt.slice(0, 11) + "09:14:" + (20 + ev.t).toFixed(3) + "Z"],
              ["SESSION", ev.sessionId || (source === "FIXTURE" ? SESSION.id : "UNAVAILABLE")],
              ["AGENT", ev.agentId || (source === "FIXTURE" ? SESSION.agentId : "UNAVAILABLE")],
              ["CONTRACT", ev.contractId || (source === "FIXTURE" ? SESSION.contractId : "NOT RECORDED")],
              ["TOOL", ev.tool],
              ["RESOURCE", ev.resource],
              ["CONTEXT", <TrustChip t={ev.trust} />],
              ["DECISION", <DecisionChip d={ev.decision} />],
              ["REASON", ev.reason],
              ["EXECUTION", ev.execution],
              ["BYTES RETURNED", ev.bytes == null ? "UNKNOWN" : String(ev.bytes)],
              ["HTTP STATUS", ev.http == null ? "UNKNOWN" : String(ev.http)],
              ["AUTHORITY", ev.authProvider || "UNKNOWN"],
              ["POLICY STORE", ev.policyStoreId || "LOCAL / UNAVAILABLE"],
              ["POLICY", "server/policies/devfix.cedar"],
            ]}
          />
        </Panel>

        <div>
          <ChainLink ev={ev} events={safeEvents} />
        </div>
      </div>
    </>
  );
}
