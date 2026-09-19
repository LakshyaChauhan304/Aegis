import crypto from 'crypto';
import { ContractValidationStatus } from './task-contracts.js';

export interface EvidenceEvent {
  eventId: string;
  timestamp: string;
  sessionId: string;
  agentId: string;
  contractId: string;
  contractVersion: string;
  contractHash: string;
  contractValidation: {
    status: ContractValidationStatus;
    valid: boolean;
    reason?: string;
  };
  action: string;
  resource: string;
  context: Record<string, any>;
  decision: "ALLOW" | "DENY";
  reason: string;
  authorization: {
    provider: string; // 'local-cedar' | 'amazon-verified-permissions'
    policyStoreId?: string;
    error?: string;
  };
  previousHash: string;
  hash: string;
}

/**
 * Recursively sorts object keys to ensure identical JSON representations for
 * structurally identical objects, regardless of insertion order.
 */
function sortKeysRecursive(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortKeysRecursive);
  }
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, any> = {};
  for (const key of sortedKeys) {
    result[key] = sortKeysRecursive(obj[key]);
  }
  return result;
}

/**
 * Deterministically canonicalizes an event.
 * Excludes the 'hash' property if present.
 */
export function canonicalize(event: Omit<EvidenceEvent, 'hash'> | EvidenceEvent): string {
  // Extract hash so it's not included in its own digest
  const { hash, ...unhashed } = event as EvidenceEvent;

  // Recursively sort all nested keys to ensure absolute determinism
  const sorted = sortKeysRecursive(unhashed);

  return JSON.stringify(sorted);
}

/**
 * Computes the SHA-256 hash of a canonicalized event.
 */
export function computeHash(event: Omit<EvidenceEvent, 'hash'> | EvidenceEvent): string {
  return crypto.createHash('sha256').update(canonicalize(event)).digest('hex');
}

/**
 * The Ledger maintains the cryptographically linked SHA-256 hash chain of evidence events.
 */
export class Ledger {
  private events: EvidenceEvent[] = [];

  public appendEvent(eventData: Omit<EvidenceEvent, 'eventId' | 'timestamp' | 'previousHash' | 'hash'>): EvidenceEvent {
    const previousHash = this.events.length > 0 ? this.events[this.events.length - 1].hash : 'GENESIS';
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = new Date().toISOString();

    const unhashedEvent = {
      ...eventData,
      eventId,
      timestamp,
      previousHash
    };

    const hash = computeHash(unhashedEvent);
    const fullEvent: EvidenceEvent = { ...unhashedEvent, hash };
    this.events.push(fullEvent);

    return fullEvent;
  }

  public getEvents(): EvidenceEvent[] {
    return this.events;
  }

  public verifyChain(): boolean {
    let prevHash = "GENESIS";
    for (let i = 0; i < this.events.length; i++) {
      const ev = this.events[i];
      if (ev.previousHash !== prevHash) {
        throw new Error(`Chain broken at index ${i}: Expected prevHash ${prevHash}, got ${ev.previousHash}`);
      }
      const computed = computeHash(ev);
      if (computed !== ev.hash) {
        throw new Error(`Hash mismatch at index ${i}: Expected ${ev.hash}, computed ${computed}`);
      }
      prevHash = ev.hash;
    }
    return true;
  }
}

export const globalLedger = new Ledger();