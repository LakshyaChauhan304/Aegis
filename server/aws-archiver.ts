import "dotenv/config";
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { EvidenceEvent } from "./ledger.js";

const region = process.env.AWS_REGION || "us-east-1";

// We instantiate these lazily or outside, but they will fail gracefully if no credentials exist
const ebClient = new EventBridgeClient({ region });
const ddbClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true }
});
const s3Client = new S3Client({ region });

function parseTimeoutMs(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const archivalTimeoutMs = parseTimeoutMs(
  process.env.AEGIS_AWS_ARCHIVAL_TIMEOUT_MS || process.env.AEGIS_AWS_SDK_TIMEOUT_MS,
  5000
);

async function sendWithTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } catch (err: any) {
    if (controller.signal.aborted) {
      throw new Error(`${label} request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export interface ArchivalResults {
  eventBridge: { status: "success" | "failed" | "pending"; eventId?: string; error?: string };
  dynamoDb: { status: "success" | "failed" | "pending"; error?: string };
  s3: { status: "success" | "failed" | "pending"; error?: string };
}

let lastArchivalResults: ArchivalResults | null = null;

export function getLastArchivalResults() {
  return lastArchivalResults;
}

function safeAwsError(err: any): string {
  const message = String(err?.message || err || "AWS archival failed");
  if (message.includes("timed out")) return message;
  if (message.includes("credentials") || message.includes("Could not load credentials")) return "AWS_CREDENTIALS_UNAVAILABLE";
  if (message.includes("AccessDenied")) return "AWS_ACCESS_DENIED";
  if (message.includes("InvalidSignature") || message.includes("UnrecognizedClient")) return "AWS_AUTHENTICATION_FAILED";
  if (message.includes("NoSuchBucket")) return "S3_BUCKET_UNAVAILABLE";
  if (message.includes("ResourceNotFound")) return "AWS_RESOURCE_NOT_FOUND";
  return "AWS_ARCHIVAL_UNAVAILABLE";
}

export async function archiveToAWS(event: EvidenceEvent): Promise<ArchivalResults> {
  const results: ArchivalResults = {
    eventBridge: { status: "pending" },
    dynamoDb: { status: "pending" },
    s3: { status: "pending" }
  };

  // 1. EventBridge (Telemetry)
  try {
    const response = await sendWithTimeout(
      (abortSignal) => ebClient.send(new PutEventsCommand({
        Entries: [{
          Source: "aegis.pep",
          DetailType: "EvidenceEvent",
          Detail: JSON.stringify(event),
          EventBusName: process.env.AEGIS_EVENT_BUS || "default"
        }]
      }), { abortSignal }),
      archivalTimeoutMs,
      "EventBridge"
    );
    const entry = response.Entries?.[0];
    if (response.FailedEntryCount && response.FailedEntryCount > 0) {
      throw new Error(entry?.ErrorMessage || entry?.ErrorCode || "EventBridge PutEvents failed");
    }
    results.eventBridge.status = "success";
    results.eventBridge.eventId = entry?.EventId;
  } catch (e: any) {
    results.eventBridge.status = "failed";
    results.eventBridge.error = safeAwsError(e);
  }

  // 2. DynamoDB (Persistence)
  try {
    await sendWithTimeout(
      (abortSignal) => docClient.send(new PutCommand({
        TableName: process.env.AEGIS_DYNAMODB_TABLE || "AegisEvidence",
        Item: event
      }), { abortSignal }),
      archivalTimeoutMs,
      "DynamoDB"
    );
    results.dynamoDb.status = "success";
  } catch (e: any) {
    results.dynamoDb.status = "failed";
    results.dynamoDb.error = safeAwsError(e);
  }

  // 3. S3 Object Lock (Immutable Archival in Compliance Mode)
  try {
    // Retain for 1 year
    const retainUntil = new Date();
    retainUntil.setFullYear(retainUntil.getFullYear() + 1);
    
    await sendWithTimeout(
      (abortSignal) => s3Client.send(new PutObjectCommand({
        Bucket: process.env.AEGIS_S3_BUCKET || "aegis-evidence-archive",
        Key: `evidence/${event.eventId}.json`,
        Body: JSON.stringify(event, null, 2),
        ContentType: "application/json",
        ObjectLockMode: "COMPLIANCE",
        ObjectLockRetainUntilDate: retainUntil
      }), { abortSignal }),
      archivalTimeoutMs,
      "S3"
    );
    results.s3.status = "success";
  } catch (e: any) {
    results.s3.status = "failed";
    results.s3.error = safeAwsError(e);
  }

  lastArchivalResults = results;
  return results;
}
