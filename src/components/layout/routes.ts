export const ROUTE_GROUPS = [
  {
    group: "Control",
    items: [
      { id: "overview", label: "Overview" },
      { id: "agents", label: "Agents" },
      { id: "execution", label: "Agent Execution" },
      { id: "contracts", label: "Task Contracts" },
      { id: "policies", label: "Policies" },
      { id: "decisions", label: "Decisions" },
    ],
  },
  {
    group: "Record",
    items: [
      { id: "sessions", label: "Sessions" },
      { id: "evidence", label: "Evidence Ledger" },
      { id: "recorder", label: "Flight Recorder" },
      { id: "lineage", label: "Evidence Lineage" },
    ],
  },
  {
    group: "Investigate",
    items: [
      { id: "investigations", label: "Investigations" },
      { id: "tests", label: "Security Tests" },
    ],
  },
  {
    group: "System",
    items: [{ id: "aws", label: "AWS Control Plane" }],
  },
];

export const SPECIAL_ROUTE_IDS = ["onboarding"];

export const ROUTE_IDS = [...SPECIAL_ROUTE_IDS, ...ROUTE_GROUPS.flatMap((g) => g.items.map((i) => i.id))];

export const ROUTE_LABELS = Object.fromEntries(
  [
    ["onboarding", "AEGIS Onboarding"],
    ...ROUTE_GROUPS.flatMap((g) => g.items.map((i) => [i.id, i.label])),
  ]
);

export const DEFAULT_ROUTE = "onboarding";

export const RAILED_ROUTES = new Set(["execution", "evidence", "lineage", "decisions", "recorder"]);

export const TRANSPORT_ROUTES = new Set(["execution", "evidence", "lineage", "recorder"]);

export function parseHash(hash: string) {
  const id = String(hash || "").replace(/^#/, "");
  return ROUTE_IDS.includes(id) ? id : DEFAULT_ROUTE;
}
