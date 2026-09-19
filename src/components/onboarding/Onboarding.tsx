import React, { useMemo, useState } from "react";
import { CONTRACT, EVENTS, SESSION } from "../../data/fixtures.js";

function MiniArchitecture() {
  return (
    <div className="onboard-iso" aria-hidden="true">
      <div className="iso-rail" style={{ left: "31%", top: "24%", width: "38%", transform: "rotate(62deg)" }} />
      <div className="iso-rail" style={{ left: "44%", top: "43%", width: "36%", transform: "rotate(104deg)" }} />
      <div className="iso-rail" style={{ left: "36%", top: "62%", width: "45%", transform: "rotate(-8deg)" }} />
      <div className="iso-block" style={{ left: "42%", top: "2%" }}>Agent<br />DevFix</div>
      <div className="iso-block" style={{ left: "29%", top: "24%" }}>Request</div>
      <div className="iso-block" style={{ left: "36%", top: "43%" }}>Task<br />Contract</div>
      <div className="iso-block dark" style={{ left: "36%", top: "64%" }}>Cedar<br />PEP</div>
      <div className="iso-block" style={{ left: "8%", top: "75%" }}>Tool</div>
      <div className="iso-block" style={{ right: "6%", top: "74%" }}>Evidence</div>
    </div>
  );
}

function HowItWorksVisual() {
  const steps = [
    ["01", "REQUEST", "Agent attempts an action."],
    ["02", "TASK CONTRACT", "Defines what the agent may attempt."],
    ["03", "CONTEXT + PROVENANCE", "Carries source and trust metadata."],
    ["04", "CEDAR", "Authorizes the request using policy."],
    ["05", "DECISION", "Produces ALLOW or DENY."],
    ["06", "ENFORCEMENT", "Only allowed actions reach the tool."],
    ["07", "EVIDENCE", "The event is recorded and verifiable."],
  ];
  return (
    <div className="onboard-steps">
      {steps.map(([n, title, text]) => (
        <div className={"onboard-step" + (title === "CEDAR" ? " cedar" : "")} key={n}>
          <div className="num">{n}</div>
          <div>
            <strong>{title}</strong>
            <span>{text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DecisionFlow({ kind }: { kind: "allow" | "deny" }) {
  const allow = kind === "allow";
  const items = allow
    ? [
        ["package.json", "Trusted source"],
        ["Task Contract", CONTRACT.id],
        ["Cedar", "Policy evaluation"],
        ["ALLOW", "Authorization passes"],
        ["Protected Tool", "Filesystem"],
        ["EXECUTED", "Tool reached"],
      ]
    : [
        [".env", "Sensitive file"],
        ["Task Contract", CONTRACT.id],
        ["Cedar", "Policy evaluation"],
        ["DENY", "Authorization refused"],
        ["Executor Never Reached", "Tool inactive"],
        ["Evidence", "Event recorded"],
        ["Hash Chain", "Integrity link"],
        ["Investigation", "Post-hoc analysis"],
      ];

  return (
    <div className={"decision-flow " + kind}>
      <div className="flow-head">
        <span>{allow ? "ALLOW EXAMPLE" : "DENY EXAMPLE"}</span>
        <b>{allow ? "ALLOW" : "DENY"}</b>
      </div>
      {items.map(([title, sub], index) => (
        <div className="flow-row" key={`${kind}-${title}`}>
          <div className="flow-dot">{index + 1}</div>
          <div>
            <strong>{title}</strong>
            <span>{sub}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Onboarding({ go }: { go: (route: string) => void }) {
  const [step, setStep] = useState(0);
  const allowCount = useMemo(() => EVENTS.filter((event: any) => event.decision === "ALLOW").length, []);
  const denyCount = useMemo(() => EVENTS.filter((event: any) => event.decision === "DENY").length, []);

  const screens = [
    {
      kicker: "01 / WELCOME",
      title: "AEGIS",
      subtitle: "SECURITY CONTROL PLANE FOR AI AGENTS",
      copy: "Control what autonomous agents can do, why they can do it, and what happens next.",
      visual: <MiniArchitecture />,
    },
    {
      kicker: "02 / HOW IT WORKS",
      title: "HOW AEGIS WORKS",
      subtitle: "A complete security control plane for autonomous agents.",
      copy: "Every request moves through declared scope, provenance, Cedar authorization, enforcement, and evidence.",
      visual: <HowItWorksVisual />,
    },
    {
      kicker: "03 / SEE IT DECIDE",
      title: "AEGIS DECIDES BEFORE THE TOOL DOES.",
      subtitle: "Same agent. Same contract. Different outcomes.",
      copy: `${allowCount} recorded ALLOW decisions and ${denyCount} recorded DENY decision in the current scenario.`,
      visual: (
        <div className="decision-pair">
          <DecisionFlow kind="allow" />
          <DecisionFlow kind="deny" />
        </div>
      ),
    },
    {
      kicker: "04 / READY",
      title: "READY TO ENTER THE CONTROL PLANE?",
      subtitle: "Explore live decisions, evidence, and investigations.",
      copy: `Reference session ${SESSION.id} uses ${CONTRACT.id}. Runtime authority remains Cedar / Amazon Verified Permissions.`,
      visual: (
        <div className="ready-visual">
          <div className="visual-copy">CONTROL<br />OBSERVE<br />INVESTIGATE<br />VERIFY</div>
        </div>
      ),
    },
  ];

  const current = screens[step];

  return (
    <main className="onboarding">
      <section className="onboard-frame">
        <div className="onboard-copy">
          <div className="onboard-kicker">{current.kicker}</div>
          <div className="onboard-brand">
            <span className="mini-mark" />
            <span>AEGIS</span>
          </div>
          <h1>{current.title}</h1>
          <h2>{current.subtitle}</h2>
          <p>{current.copy}</p>
          <div className="onboard-actions">
            <button className="btn primary" onClick={() => go("overview")}>ENTER AEGIS -&gt;</button>
            <button className="btn" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>Previous</button>
            <button className="btn" onClick={() => setStep((value) => Math.min(screens.length - 1, value + 1))} disabled={step === screens.length - 1}>Next</button>
          </div>
          <div className="onboard-foot">{String(step + 1).padStart(2, "0")} / 04</div>
        </div>
        <div className="onboard-visual">{current.visual}</div>
      </section>
    </main>
  );
}
