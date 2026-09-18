import React, { useState } from "react";
import Panel from "../shared/Panel.tsx";
import Note from "../shared/Note.tsx";
import { short } from "../../data/fixtures.js";

export default function ChainLink({ ev, events }: any) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <>
      <Panel title="CRYPTOGRAPHIC CHAIN LINK" flush>
        <div style={{ padding: "var(--s4)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
            <div className="mono dim" style={{ fontSize: 9.5, letterSpacing: ".12em" }}>PREVIOUS HASH {ev.prev ? "" : "(GENESIS)"}</div>
            {ev.prev && (
              <button 
                className="btn btn-small mono" 
                onClick={() => handleCopy(ev.prev)}
                style={{ padding: "2px 8px", fontSize: 10, background: "var(--line)", border: "none" }}
              >
                {copied === ev.prev ? "COPIED!" : "COPY"}
              </button>
            )}
          </div>
          <div className="hash mono" style={{ marginBottom: 12, wordBreak: "break-all", fontSize: 12, color: ev.prev ? "var(--dim)" : "var(--muted)" }}>
            {ev.prev || "0000000000000000000000000000000000000000000000000000000000000000"}
          </div>

          <div className="mono dim" style={{ fontSize: 11, marginBottom: 12, display: "flex", flexDirection: "column", alignItems: "center" }} aria-hidden="true">
            <div style={{ height: 16, width: 2, background: "var(--info)" }}></div>
            <div style={{ padding: "4px 8px", background: "var(--info-bg)", color: "var(--info)", borderRadius: 2, margin: "4px 0" }}>SHA-256 + Event Data</div>
            <div style={{ height: 16, width: 2, background: "var(--info)" }}></div>
            <div style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "6px solid var(--info)" }}></div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
            <div className="mono dim" style={{ fontSize: 9.5, letterSpacing: ".12em" }}>CURRENT HASH</div>
            <button 
              className="btn btn-small mono" 
              onClick={() => handleCopy(ev.curr)}
              style={{ padding: "2px 8px", fontSize: 10, background: "var(--allow-bg)", color: "var(--allow)", border: "1px solid var(--allow)" }}
            >
              {copied === ev.curr ? "COPIED!" : "COPY"}
            </button>
          </div>
          <div className="hash mono text-glow" style={{ color: "var(--allow)", wordBreak: "break-all", fontSize: 12 }}>
            {ev.curr}
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--line)" }}>
          <button 
            onClick={() => setShowJson(!showJson)}
            style={{ width: "100%", padding: "var(--s3) var(--s4)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--panel-3)" }}
          >
            <span className="mono dim" style={{ fontSize: 10, letterSpacing: "0.1em" }}>INSPECT HASHED PAYLOAD</span>
            <span className="mono dim">{showJson ? "[-]" : "[+]"}</span>
          </button>
          {showJson && (
            <div style={{ padding: "var(--s4)", background: "var(--bg)", borderTop: "1px solid var(--line)", overflowX: "auto" }}>
              <pre className="mono" style={{ margin: 0, fontSize: 11, color: "var(--fg)" }}>
                {JSON.stringify(ev, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="CHAIN POSITION" flush style={{ marginTop: "var(--s5)" }}>
        <div className="chain" style={{ display: "flex", flexDirection: "column", gap: 1, background: "var(--line)" }}>
          {events.map((e: any) => (
            <div
              className="lnk"
              key={e.id}
              style={{ 
                background: e.id === ev.id ? "var(--panel-3)" : "var(--panel)", 
                padding: "8px 16px",
                display: "flex",
                gap: "12px",
                alignItems: "center"
              }}>
              <div className="sq mono dim" style={{ fontSize: 11, minWidth: 24 }}>{String(e.seq).padStart(3, "0")}</div>
              <div className="bd mono" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 8 }}>
                <span className={e.id === ev.id ? "text-glow" : ""} style={{ color: e.id === ev.id ? "var(--info)" : "var(--fg)" }}>{e.id}</span>
                <span className="dim"> | </span>
                <span className="dim">{short(e.prev || "0000000000000000000000000000000000000000000000000000000000000000")}</span>
                <span className="dim">&rarr;</span>
                <span className={e.id === ev.id ? "" : "dim"} style={{ color: e.id === ev.id ? "var(--allow)" : "" }}>{short(e.curr)}</span>
                <span style={{ color: "var(--allow)", marginLeft: "auto" }}> &#10003;</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)" }}>
          <Note>
            Modifying any recorded field changes that event's hash and breaks every link
            after it. Verification is recomputation on the backend, not a stored flag.
          </Note>
        </div>
      </Panel>
    </>
  );
}
