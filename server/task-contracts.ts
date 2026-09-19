import crypto from "crypto";
import path from "path";

export type TrustLevel = "TRUSTED" | "UNTRUSTED_EXTERNAL";

export type TaskContract = {
  contractId: string;
  version: string;
  contractHash: string;
  agentId: string;
  session: {
    allowedExact: string[];
    allowedPrefixes: string[];
  };
  purpose: string;
  scope: {
    allowed: Array<{
      tool: string;
      action: string;
      resource: string;
      trust: TrustLevel[];
      arguments?: {
        mode: "none";
      };
    }>;
    deniedResources: string[];
  };
};

export type ToolRequest = {
  sessionId: string;
  agentId: string;
  contractId: string;
  tool: string;
  resource: string;
  action: string;
  arguments?: unknown;
  context: {
    trust: string;
    source?: string;
  };
};

export type NormalizedAuthorizationRequest = {
  principal: {
    agentId: string;
  };
  session: {
    sessionId: string;
  };
  contract: {
    contractId: string;
  };
  operation: {
    tool: string;
    action: string;
    actionId: string;
    resource: {
      type: "file";
      raw: string;
      id: string;
      valid: boolean;
      reason?: string;
    };
    arguments: {
      present: boolean;
      value: unknown;
      hash: string;
      redacted: boolean;
    };
  };
  context: {
    trust: string;
    source: string;
  };
};

export type ContractValidationStatus =
  | "VALID"
  | "MISSING_CONTRACT"
  | "UNKNOWN_CONTRACT"
  | "AGENT_MISMATCH"
  | "SESSION_MISMATCH"
  | "OUT_OF_SCOPE_ACTION"
  | "OUT_OF_SCOPE_RESOURCE"
  | "TRUST_CONSTRAINT_FAILED"
  | "ARGUMENT_CONSTRAINT_FAILED";

export type ContractValidation = {
  status: ContractValidationStatus;
  valid: boolean;
  reason?: string;
  contractId?: string;
  contractVersion?: string;
  contractHash?: string;
};

type ContractDefinition = Omit<TaskContract, "contractHash">;

export const DEVFIX_CONTRACT_ID = "tc_devfix_dependency_remediation_v1";

const devfixContractDefinition: ContractDefinition = {
  contractId: DEVFIX_CONTRACT_ID,
  version: "1",
  agentId: "DevFix",
  session: {
    allowedExact: ["test-sess", "timeout-test"],
    allowedPrefixes: [
      "sess_ui_",
      "sess_test_",
      "sess_aws_test_",
      "sess_bedrock_test_",
      "sess_hardening_",
      "sess_truth_",
      "sess_contract_",
      "sess_phase3_",
    ],
  },
  purpose: "dependency remediation",
  scope: {
    allowed: [
      { tool: "fs", action: "fs:read", resource: "package.json", trust: ["TRUSTED"] },
      { tool: "fs", action: "fs:read", resource: "package-lock.json", trust: ["TRUSTED"] },
      { tool: "fs", action: "fs:read", resource: "node_modules/axios/README.md", trust: ["UNTRUSTED_EXTERNAL"] },
    ],
    deniedResources: [".env"],
  },
};

function sortKeysRecursive(value: any): any {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeysRecursive);
  const sorted: Record<string, any> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortKeysRecursive(value[key]);
  }
  return sorted;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysRecursive(value)) ?? "undefined";
}

function hashCanonical(value: unknown): string {
  return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalContract(definition: ContractDefinition): string {
  return canonicalJson(definition);
}

function withHash(definition: ContractDefinition): TaskContract {
  return {
    ...definition,
    contractHash: crypto.createHash("sha256").update(canonicalContract(definition)).digest("hex"),
  };
}

const contracts = new Map<string, TaskContract>([
  [DEVFIX_CONTRACT_ID, withHash(devfixContractDefinition)],
]);

export function getTaskContract(contractId: string | undefined): TaskContract | undefined {
  if (!contractId) return undefined;
  return contracts.get(contractId);
}

export function listTaskContracts(): TaskContract[] {
  return Array.from(contracts.values());
}

export type ContractRequest = {
  contract?: {
    contractId?: string;
  };
  session?: {
    sessionId?: string;
  };
  principal?: {
    agentId?: string;
  };
  operation?: {
    tool?: string;
    actionId?: string;
    resource?: {
      id?: string;
      valid?: boolean;
      reason?: string;
    };
    arguments?: {
      present?: boolean;
    };
  };
  context?: {
    trust?: string;
  };
};

function normalizeAction(actionId: string): string {
  if (actionId === "fs:read") return "read";
  const parts = actionId.split(":");
  return parts[parts.length - 1] || actionId;
}

function normalizeFileResource(rawResource: string): NormalizedAuthorizationRequest["operation"]["resource"] {
  const raw = rawResource;
  const projectRoot = path.resolve(process.cwd());
  const candidate = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(projectRoot, raw);
  const relative = path.relative(projectRoot, candidate);

  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    return {
      type: "file",
      raw,
      id: raw.replace(/\\/g, "/"),
      valid: false,
      reason: "resource path resolves outside the project root",
    };
  }

  const id = relative.split(path.sep).join("/");
  return {
    type: "file",
    raw,
    id: id === "" ? "." : id,
    valid: true,
  };
}

export function normalizeToolRequest(request: ToolRequest): NormalizedAuthorizationRequest {
  const argumentsPresent = Object.prototype.hasOwnProperty.call(request, "arguments");
  const argumentValue = argumentsPresent ? request.arguments : [];
  const argumentHash = hashCanonical(argumentValue);

  return {
    principal: {
      agentId: request.agentId,
    },
    session: {
      sessionId: request.sessionId,
    },
    contract: {
      contractId: request.contractId,
    },
    operation: {
      tool: request.tool,
      action: normalizeAction(request.action),
      actionId: request.action,
      resource: normalizeFileResource(request.resource),
      arguments: {
        present: argumentsPresent,
        value: argumentsPresent ? undefined : [],
        hash: argumentHash,
        redacted: argumentsPresent,
      },
    },
    context: {
      trust: request.context.trust,
      source: request.context.source || "unknown",
    },
  };
}

function sessionMatches(contract: TaskContract, sessionId: string | undefined): boolean {
  if (!sessionId) return false;
  return contract.session.allowedExact.includes(sessionId) ||
    contract.session.allowedPrefixes.some((prefix) => sessionId.startsWith(prefix));
}

export function validateTaskContract(request: ContractRequest): ContractValidation {
  if (!request.contract?.contractId) {
    return { status: "MISSING_CONTRACT", valid: false, reason: "contractId is required" };
  }

  const contract = getTaskContract(request.contract.contractId);
  if (!contract) {
    return {
      status: "UNKNOWN_CONTRACT",
      valid: false,
      reason: "contractId was not found in the trusted local registry",
      contractId: request.contract.contractId,
    };
  }

  const base = {
    contractId: contract.contractId,
    contractVersion: contract.version,
    contractHash: contract.contractHash,
  };

  if (request.principal?.agentId !== contract.agentId) {
    return { ...base, status: "AGENT_MISMATCH", valid: false, reason: "request agentId is not bound to this contract" };
  }

  if (!sessionMatches(contract, request.session?.sessionId)) {
    return { ...base, status: "SESSION_MISMATCH", valid: false, reason: "request sessionId is not bound to this contract" };
  }

  const actionAllowed = contract.scope.allowed.some((entry) =>
    entry.tool === request.operation?.tool && entry.action === request.operation?.actionId
  );
  if (!actionAllowed) {
    return { ...base, status: "OUT_OF_SCOPE_ACTION", valid: false, reason: "requested tool/action is outside contract scope" };
  }

  if (!request.operation?.resource?.valid) {
    return { ...base, status: "OUT_OF_SCOPE_RESOURCE", valid: false, reason: request.operation?.resource?.reason || "requested resource is outside contract scope" };
  }

  const resourceEntry = contract.scope.allowed.find((entry) =>
    entry.tool === request.operation?.tool && entry.action === request.operation?.actionId && entry.resource === request.operation?.resource?.id
  );
  if (!resourceEntry || contract.scope.deniedResources.includes(String(request.operation?.resource?.id || ""))) {
    return { ...base, status: "OUT_OF_SCOPE_RESOURCE", valid: false, reason: "requested resource is outside contract scope" };
  }

  if (!resourceEntry.trust.includes(request.context?.trust as TrustLevel)) {
    return { ...base, status: "TRUST_CONSTRAINT_FAILED", valid: false, reason: "request provenance does not satisfy contract trust constraints" };
  }

  if ((resourceEntry.arguments?.mode || "none") === "none" && request.operation?.arguments?.present) {
    return { ...base, status: "ARGUMENT_CONSTRAINT_FAILED", valid: false, reason: "requested arguments are outside contract scope" };
  }

  return { ...base, status: "VALID", valid: true };
}
