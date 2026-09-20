import crypto from "crypto";
import fs from "fs";
import path from "path";
import { EvidenceEvent } from "./ledger.js";
import { getLastArchivalResults } from "./aws-archiver.js";
import { getLastInvestigationResult } from "./bedrock-investigator.js";
import { getAwsResourceStatus } from "./aws-status.js";

export type TruthState =
  | "LIVE"
  | "LOCAL"
  | "PARTIAL"
  | "FIXTURE"
  | "UNAVAILABLE"
  | "SDK_READY"
  | "LIVE_VERIFIED";

const policyPath = path.join(process.cwd(), "server/policies/devfix.cedar");

export function getPolicyInfo() {
  const source = fs.readFileSync(policyPath, "utf8");
  return {
    source: "LOCAL" as TruthState,
    file: "server/policies/devfix.cedar",
    hashAlgorithm: "SHA-256",
    hash: crypto.createHash("sha256").update(source).digest("hex"),
    policyAuthority: "local-cedar",
    sourceText: source,
    note: "This is the current Cedar policy loaded by the local Aegis PEP. Fixture policy text is not authoritative.",
  };
}

export function getCapabilities() {
  return {
    source: "LOCAL" as TruthState,
    runtimeTools: [
      {
        tool: "fs",
        action: "fs:read",
        state: "LOCAL" as TruthState,
        note: "Implemented through the PEP. Protected filesystem read executes only after ALLOW.",
      },
      {
        tool: "shell",
        action: "shell:exec",
        state: "UNAVAILABLE" as TruthState,
        note: "Intentionally not implemented in this phase. No arbitrary shell execution is exposed.",
      },
      {
        tool: "network",
        action: "net:connect",
        state: "UNAVAILABLE" as TruthState,
        note: "Network tool enforcement is a documented target, not a current runtime capability.",
      },
    ],
    investigation: {
      bedrock: "SDK_READY" as TruthState,
      note: "Bedrock is post-hoc only and is invoked through the investigation endpoint, never as runtime authority.",
    },
  };
}

export async function getAegisStatus(events: EvidenceEvent[]) {
  const lastArchival = getLastArchivalResults();
  const lastInvestigation = getLastInvestigationResult();

  const resourceStatus = await getAwsResourceStatus();
  return {
    source: resourceStatus.source as TruthState,
    securityCore: {
      pep: "LOCAL" as TruthState,
      cedar: "LOCAL" as TruthState,
      ledger: "LOCAL" as TruthState,
      protectedExecution: "LOCAL" as TruthState,
      note: "The local Express PEP authorizes before executing supported tools and records an in-process evidence event.",
    },
    aws: [
      ...resourceStatus.aws,
      {
        name: "Amazon EventBridge",
        role: "Evidence event transport",
        state: lastArchival?.eventBridge.status === "success" ? "LIVE_VERIFIED" : "NOT_VERIFIED",
        note: lastArchival?.eventBridge.status === "success" ? "A live archival write succeeded in this process." : "Historical PutEvents readback is not implemented.",
      },
      {
        name: "Amazon Bedrock",
        role: "Post-hoc advisory investigation",
        state: lastInvestigation?.status === "success" ? "LIVE_VERIFIED" : "SDK_READY",
        note: lastInvestigation?.status === "success"
          ? "A post-hoc investigation call succeeded."
          : "SDK client is integrated. Investigation remains advisory and outside the runtime authorization response.",
      },
      {
        name: "AWS KMS",
        role: "Task contract signing and key management",
        state: "UNAVAILABLE" as TruthState,
        note: "KMS-backed task contract verification is not implemented in this phase.",
      },
    ],
  };
}
