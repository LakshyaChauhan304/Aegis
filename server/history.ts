import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const tableName = process.env.AEGIS_DYNAMODB_TABLE || "AegisEvidence";
const client = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.AWS_REGION || "ap-southeast-2",
}));

export type HistoryResult = {
  source: "LIVE" | "UNAVAILABLE";
  events: any[];
  sessions: any[];
  agents: any[];
  decisions: any[];
  recentActivity: any[];
  totalEvents: number;
  reason?: string;
};

function isPrimaryEvent(item: any) {
  return item?.eventType === "AUTHORIZATION_EXECUTION";
}

function buildHistory(items: any[]): HistoryResult {
  const receipts = new Map<string, any>();
  for (const item of items) {
    if (item?.eventType === "ARCHIVAL_RECEIPT" && item.originalEventId) receipts.set(item.originalEventId, item);
  }

  const events = items
    .filter(isPrimaryEvent)
    .map((item) => ({
      ...item,
      id: item.eventId,
      eventId: item.eventId,
      archivalStatus: receipts.get(item.eventId)?.archival || item.archival || null,
    }))
    .sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")));

  const sessions = new Map<string, any>();
  const agents = new Map<string, any>();
  for (const event of events) {
    const session = sessions.get(event.sessionId) || {
      sessionId: event.sessionId,
      agentId: event.agentId,
      contractId: event.contractId,
      events: [],
    };
    session.events.push(event.eventId);
    sessions.set(event.sessionId, session);

    const agent = agents.get(event.agentId) || { agentId: event.agentId, sessions: new Set<string>() };
    agent.sessions.add(event.sessionId);
    agents.set(event.agentId, agent);
  }

  const decisions = events.map((event) => ({
    decisionId: event.eventId,
    eventId: event.eventId,
    sessionId: event.sessionId,
    agentId: event.agentId,
    contractId: event.contractId,
    decision: event.decision,
    reason: event.reason,
    resource: event.resource,
    trust: event.context?.trust || event.trust,
    executionState: event.executionState,
    timestamp: event.timestamp,
  }));

  return {
    source: "LIVE",
    events,
    sessions: Array.from(sessions.values()),
    agents: Array.from(agents.values()).map((agent) => ({ ...agent, sessions: Array.from(agent.sessions) })),
    decisions,
    recentActivity: events.slice(-20).reverse(),
    totalEvents: events.length,
  };
}

export async function getPersistedHistory(): Promise<HistoryResult> {
  try {
    const items: any[] = [];
    let ExclusiveStartKey: Record<string, any> | undefined;
    do {
      const page = await client.send(new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey,
      }));
      items.push(...(page.Items || []));
      ExclusiveStartKey = page.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return buildHistory(items);
  } catch (error: any) {
    return {
      source: "UNAVAILABLE",
      events: [],
      sessions: [],
      agents: [],
      decisions: [],
      recentActivity: [],
      totalEvents: 0,
      reason: error?.name === "AccessDeniedException" ? "AWS_ACCESS_DENIED" : "DYNAMODB_HISTORY_UNAVAILABLE",
    };
  }
}
