import React, { useState } from "react";

interface HeroStep {
  id: string;
  stepNum: number;
  label: string;
  resource: string;
  action: string;
  trust: "INTERNAL" | "TRUSTED" | "UNTRUSTED_EXTERNAL";
  decision: "ALLOW" | "DENY" | "PENDING";
  http: number | null;
  execution: "EXECUTED" | "NOT_EXECUTED" | "PENDING";
  bytes: number | null; // strictly provided by backend/fixture, never calculated
  policyRule: string;
  detail: string;
  hash?: string | null;
}

interface HeroProofPipelineProps {
  liveResults?: any[];
  events?: any[];
  onSelectStep?: (resource: string) => void;
}

export default function HeroProofPipeline({ liveResults = [], events = [], onSelectStep }: HeroProofPipelineProps) {
  const [activeStep, setActiveStep] = useState<number>(4); // Default to Step 4 (.env breach)

  // Map live results or fallback to ledger/fixture events
  const getStepData = (stepNum: number, resource: string, fallbackRule: string, defaultDetail: string): HeroStep => {
    // 1. Check liveResults from live PEP execution
    const liveMatch = liveResults.find((r) => r.resource === resource);
    // 2. Check events from ledger
    const eventMatch = events.find((e) => e.resource === resource);

    if (liveMatch) {
      const isDeny = liveMatch.decision?.decision === "DENY" || liveMatch.status === 403;
      return {
        id: liveMatch.eventId || `live_${stepNum}`,
        stepNum,
        label: resource.split("/").pop() || resource,
        resource,
        action: liveMatch.action || "fs:read",
        trust: (liveMatch.trust || (stepNum >= 3 ? "UNTRUSTED_EXTERNAL" : "TRUSTED")) as any,
        decision: isDeny ? "DENY" : (liveMatch.decision?.decision || "ALLOW"),
        http: liveMatch.status || (isDeny ? 403 : 200),
        execution: isDeny ? "NOT_EXECUTED" : (liveMatch.executionState || "EXECUTED"),
        bytes: isDeny ? 0 : (typeof liveMatch.bytesReturned === "number" ? liveMatch.bytesReturned : null),
        policyRule: liveMatch.reason || liveMatch.decision?.reason || fallbackRule,
        detail: defaultDetail,
        hash: liveMatch.decision?.hash || liveMatch.eventId,
      };
    }

    if (eventMatch) {
      const isDeny = eventMatch.decision === "DENY";
      return {
        id: eventMatch.id || eventMatch.eventId || `evt_${stepNum}`,
        stepNum,
        label: resource.split("/").pop() || resource,
        resource,
        action: eventMatch.action || eventMatch.tool || "fs:read",
        trust: eventMatch.trust || (stepNum >= 3 ? "UNTRUSTED_EXTERNAL" : "INTERNAL"),
        decision: isDeny ? "DENY" : "ALLOW",
        http: eventMatch.http != null ? eventMatch.http : (isDeny ? 403 : 200),
        execution: eventMatch.execution || (isDeny ? "NOT_EXECUTED" : "EXECUTED"),
        bytes: isDeny ? 0 : (typeof eventMatch.bytes === "number" ? eventMatch.bytes : null),
        policyRule: eventMatch.reason || fallbackRule,
        detail: eventMatch.detail || defaultDetail,
        hash: eventMatch.curr || eventMatch.hash,
      };
    }

    // Default reference step representation
    const isDeny = stepNum === 4;
    return {
      id: `ref_${stepNum}`,
      stepNum,
      label: resource.split("/").pop() || resource,
      resource,
      action: "fs:read",
      trust: stepNum >= 3 ? "UNTRUSTED_EXTERNAL" : "INTERNAL",
      decision: isDeny ? "DENY" : "ALLOW",
      http: isDeny ? 403 : 200,
      execution: isDeny ? "NOT_EXECUTED" : "EXECUTED",
      bytes: isDeny ? 0 : null, // Not inferred or hardcoded if not present
      policyRule: fallbackRule,
      detail: defaultDetail,
      hash: null,
    };
  };

  const steps: HeroStep[] = [
    getStepData(
      1,
      "package.json",
      "policy_3 (permit fs:read on package.json)",
      "Agent declared baseline dependency configuration inspection. Allowed by explicit scope policy."
    ),
    getStepData(
      2,
      "package-lock.json",
      "policy_4 (permit fs:read on package-lock.json)",
      "Agent resolved locked dependency tree. Permitted within filesystem scope."
    ),
    getStepData(
      3,
      "node_modules/axios/README.md",
      "policy_5 (permit fs:read on node_modules/**)",
      "External dependency context ingested. Flagged UNTRUSTED_EXTERNAL provenance. Contains simulated indirect injection vector attempting to redirect agent."
    ),
    getStepData(
      4,
      ".env",
      "policy_1 (forbid all operations on .env)",
      "HERO SECURITY PROOF: Agent attempted unauthorized read of production secrets. Deterministically DENIED by Cedar PEP. Execution halted: 0 bytes transferred."
    ),
  ];

  const selectedStep = steps.find((s) => s.stepNum === activeStep) || steps[3];

  const renderBytes = (bytes: number | null, isDeny: boolean) => {
    if (isDeny) {
      return <span className="proof-zero">0 BYTES (NO RESULT LEAKED)</span>;
    }
    if (typeof bytes === "number" && bytes > 0) {
      return <span>{bytes.toLocaleString()} bytes</span>;
    }
    return <span className="dim">BYTES: NOT RECORDED</span>;
  };

  return (
    <div className="hero-pipeline-panel">
      <div className="hero-pipeline-header">
        <div className="pipeline-title-group">
          <div className="badge-pillar control">CONTROL PLANE PROOF</div>
          <h2 className="pipeline-title">Canonical Remediation Security Lifecycle</h2>
          <div className="pipeline-desc">
            DevFix dependency-remediation lifecycle demonstrating deterministic PEP gating and secret protection.
          </div>
        </div>
        <div className="pipeline-legend">
          <span className="legend-item"><span className="legend-dot allow" /> ALLOWED (In Scope)</span>
          <span className="legend-item"><span className="legend-dot untrusted" /> UNTRUSTED PROVENANCE</span>
          <span className="legend-item"><span className="legend-dot deny" /> DENIED &amp; HALTED</span>
        </div>
      </div>

      {/* The 4-Card Sequential Visual Pipeline */}
      <div className="hero-cards-grid">
        {steps.map((step) => {
          const isDeny = step.decision === "DENY";
          const isUntrusted = step.trust === "UNTRUSTED_EXTERNAL";
          const isCurrent = step.stepNum === activeStep;

          return (
            <div
              key={step.stepNum}
              className={`hero-card ${isDeny ? "card-deny" : "card-allow"} ${isCurrent ? "card-active" : ""}`}
              onClick={() => {
                setActiveStep(step.stepNum);
                if (onSelectStep) onSelectStep(step.resource);
              }}
              role="button"
              tabIndex={0}
            >
              <div className="card-top">
                <span className="step-badge">STEP {step.stepNum} OF 4</span>
                <span className={`decision-pill ${isDeny ? "deny" : "allow"}`}>
                  {step.decision}
                </span>
              </div>

              <div className="card-resource" title={step.resource}>
                <span className="resource-icon">{isDeny ? "🚫" : isUntrusted ? "⚠️" : "📄"}</span>
                <span className="resource-name">{step.label}</span>
              </div>

              <div className="card-path mono dim">{step.resource}</div>

              <div className="card-metrics">
                <div className="metric-row">
                  <span className="mk">GATEWAY</span>
                  <span className={`mv mono ${isDeny ? "txt-deny" : "txt-allow"}`}>
                    {step.http ? `HTTP ${step.http}` : (isDeny ? "HTTP 403" : "HTTP 200")}
                  </span>
                </div>
                <div className="metric-row">
                  <span className="mk">EXECUTION</span>
                  <span className={`mv mono ${isDeny ? "txt-deny" : ""}`}>
                    {step.execution}
                  </span>
                </div>
                <div className="metric-row">
                  <span className="mk">PAYLOAD</span>
                  <span className="mv mono">
                    {renderBytes(step.bytes, isDeny)}
                  </span>
                </div>
                <div className="metric-row">
                  <span className="mk">PROVENANCE</span>
                  <span className={`mv mono ${isUntrusted ? "txt-untrusted" : "dim"}`}>
                    {step.trust}
                  </span>
                </div>
              </div>

              {isDeny && (
                <div className="card-breach-callout">
                  <div className="callout-accent" />
                  <span className="callout-text">BLOCKED BEFORE EXECUTION</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Deep Step Detail Inspector */}
      <div className={`step-inspector-box ${selectedStep.decision === "DENY" ? "inspector-deny" : ""}`}>
        <div className="inspector-head">
          <div className="inspector-title">
            <span className="step-tag">STEP {selectedStep.stepNum} VERIFICATION</span>
            <span className="inspector-resource mono">{selectedStep.resource}</span>
            <span className={`status-pill ${selectedStep.decision === "DENY" ? "deny" : "allow"}`}>
              {selectedStep.decision === "DENY" ? "GATEWAY REFUSAL (403 FORBIDDEN)" : "AUTHORIZED (200 OK)"}
            </span>
          </div>
          {selectedStep.hash && (
            <div className="inspector-hash mono dim">
              SHA-256: <span className="txt-mono-hash">{selectedStep.hash}</span>
            </div>
          )}
        </div>

        <div className="inspector-body">
          <div className="inspector-narrative">
            <div className="narrative-label mono">SECURITY EVALUATION &amp; FINDINGS</div>
            <div className="narrative-text">{selectedStep.detail}</div>
          </div>

          <div className="inspector-facts-grid">
            <div className="fact-cell">
              <span className="fk mono">ENFORCING AUTHORITY</span>
              <span className="fv mono txt-info">{selectedStep.policyRule}</span>
            </div>
            <div className="fact-cell">
              <span className="fk mono">PROTECTED EXECUTION</span>
              <span className={`fv mono ${selectedStep.decision === "DENY" ? "txt-deny font-bold" : ""}`}>
                {selectedStep.execution}
              </span>
            </div>
            <div className="fact-cell">
              <span className="fk mono">RETURNED BYTES</span>
              <span className="fv mono">
                {renderBytes(selectedStep.bytes, selectedStep.decision === "DENY")}
              </span>
            </div>
            <div className="fact-cell">
              <span className="fk mono">PROVENANCE METADATA</span>
              <span className={`fv mono ${selectedStep.trust === "UNTRUSTED_EXTERNAL" ? "txt-untrusted" : ""}`}>
                {selectedStep.trust}
                {selectedStep.trust === "UNTRUSTED_EXTERNAL" && (
                  <span className="provenance-subnote"> (origin classification, not malware scan)</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
