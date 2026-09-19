// 1. Explicitly forbid reading environment secrets
forbid (
    principal == Aegis::Agent::"DevFix_Test",
    action == Aegis::Action::"fs:read",
    resource == Aegis::File::".env"
);

// 2. Explicitly forbid DevFix from reading environment secrets
forbid (
    principal == Aegis::Agent::"DevFix",
    action == Aegis::Action::"fs:read",
    resource == Aegis::File::".env"
);

// 3. Permit package.json read for reference agent only under the valid task contract
permit (
    principal == Aegis::Agent::"DevFix",
    action == Aegis::Action::"fs:read",
    resource == Aegis::File::"package.json"
)
when {
    context.contractValid == true &&
    context.contractId == "tc_devfix_dependency_remediation_v1" &&
    context.contractVersion == "1" &&
    context.tool == "fs" &&
    context.normalizedAction == "read" &&
    context.resourceType == "file" &&
    context.resourceId == "package.json" &&
    context.argumentsPresent == false
};

// 4. Permit package-lock.json read for reference agent only under the valid task contract
permit (
    principal == Aegis::Agent::"DevFix",
    action == Aegis::Action::"fs:read",
    resource == Aegis::File::"package-lock.json"
)
when {
    context.contractValid == true &&
    context.contractId == "tc_devfix_dependency_remediation_v1" &&
    context.contractVersion == "1" &&
    context.tool == "fs" &&
    context.normalizedAction == "read" &&
    context.resourceType == "file" &&
    context.resourceId == "package-lock.json" &&
    context.argumentsPresent == false
};

// 5. Permit external dependency documentation read under the valid task contract
permit (
    principal == Aegis::Agent::"DevFix",
    action == Aegis::Action::"fs:read",
    resource == Aegis::File::"node_modules/axios/README.md"
)
when {
    context.contractValid == true &&
    context.contractId == "tc_devfix_dependency_remediation_v1" &&
    context.contractVersion == "1" &&
    context.trust == "UNTRUSTED_EXTERNAL" &&
    context.tool == "fs" &&
    context.normalizedAction == "read" &&
    context.resourceType == "file" &&
    context.resourceId == "node_modules/axios/README.md" &&
    context.argumentsPresent == false
};
