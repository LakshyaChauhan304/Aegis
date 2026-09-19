import crypto from "crypto";

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
    }>;
    deniedResources: string[];
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
  | "TRUST_CONSTRAINT_FAILED";

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

function canonicalContract(definition: ContractDefinition): string {
  return JSON.stringify(sortKeysRecursive(definition));
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
  contractId?: string;
  sessionId?: string;
  agentId?: string;
  tool?: string;
  action?: string;
  resource?: string;
  context?: {
    trust?: string;
  };
};

function sessionMatches(contract: TaskContract, sessionId: string | undefined): boolean {
  if (!sessionId) return false;
  return contract.session.allowedExact.includes(sessionId) ||
    contract.session.allowedPrefixes.some((prefix) => sessionId.startsWith(prefix));
}

export function validateTaskContract(request: ContractRequest): ContractValidation {
  if (!request.contractId) {
    return { status: "MISSING_CONTRACT", valid: false, reason: "contractId is required" };
  }

  const contract = getTaskContract(request.contractId);
  if (!contract) {
    return {
      status: "UNKNOWN_CONTRACT",
      valid: false,
      reason: "contractId was not found in the trusted local registry",
      contractId: request.contractId,
    };
  }

  const base = {
    contractId: contract.contractId,
    contractVersion: contract.version,
    contractHash: contract.contractHash,
  };

  if (request.agentId !== contract.agentId) {
    return { ...base, status: "AGENT_MISMATCH", valid: false, reason: "request agentId is not bound to this contract" };
  }

  if (!sessionMatches(contract, request.sessionId)) {
    return { ...base, status: "SESSION_MISMATCH", valid: false, reason: "request sessionId is not bound to this contract" };
  }

  const actionAllowed = contract.scope.allowed.some((entry) =>
    entry.tool === request.tool && entry.action === request.action
  );
  if (!actionAllowed) {
    return { ...base, status: "OUT_OF_SCOPE_ACTION", valid: false, reason: "requested tool/action is outside contract scope" };
  }

  const resourceEntry = contract.scope.allowed.find((entry) =>
    entry.tool === request.tool && entry.action === request.action && entry.resource === request.resource
  );
  if (!resourceEntry || contract.scope.deniedResources.includes(String(request.resource || ""))) {
    return { ...base, status: "OUT_OF_SCOPE_RESOURCE", valid: false, reason: "requested resource is outside contract scope" };
  }

  if (!resourceEntry.trust.includes(request.context?.trust as TrustLevel)) {
    return { ...base, status: "TRUST_CONSTRAINT_FAILED", valid: false, reason: "request provenance does not satisfy contract trust constraints" };
  }

  return { ...base, status: "VALID", valid: true };
}