import type { ProviderKey } from '../core/contracts.js';

export interface DedupeKeyInput {
  providerKey: ProviderKey;
  dedupeKey: string;
}

export interface DedupeRecord extends DedupeKeyInput {
  firstSeenAt: string;
  expiresAt: string;
}

export interface DedupeDecision {
  isDuplicate: boolean;
  record: DedupeRecord;
}

export interface AlertDeduperOptions {
  ttlMs: number;
  now?: () => number;
}

export interface AlertDeduper {
  markSeen(input: DedupeKeyInput): DedupeDecision;
  has(input: DedupeKeyInput): boolean;
  clear(input: DedupeKeyInput): boolean;
  listActive(providerKey?: ProviderKey): DedupeRecord[];
}

export function createAlertDeduper(options: AlertDeduperOptions): AlertDeduper {
  assertPositiveTtl(options.ttlMs, 'ttlMs');
  const now = options.now ?? Date.now;
  const records = new Map<string, DedupeRecord>();

  function pruneExpired(referenceTime: number): void {
    for (const [key, record] of records.entries()) {
      if (Date.parse(record.expiresAt) <= referenceTime) {
        records.delete(key);
      }
    }
  }

  return {
    markSeen(input) {
      const referenceTime = now();
      pruneExpired(referenceTime);

      const key = toScopedKey(input.providerKey, input.dedupeKey);
      const existing = records.get(key);
      if (existing) {
        return {
          isDuplicate: true,
          record: existing
        };
      }

      const record = createRecord(input, referenceTime, options.ttlMs);
      records.set(key, record);
      return {
        isDuplicate: false,
        record
      };
    },
    has(input) {
      const referenceTime = now();
      pruneExpired(referenceTime);
      return records.has(toScopedKey(input.providerKey, input.dedupeKey));
    },
    clear(input) {
      return records.delete(toScopedKey(input.providerKey, input.dedupeKey));
    },
    listActive(providerKey) {
      const referenceTime = now();
      pruneExpired(referenceTime);
      return [...records.values()].filter((record) => !providerKey || record.providerKey === providerKey);
    }
  };
}

function createRecord(input: DedupeKeyInput, referenceTime: number, ttlMs: number): DedupeRecord {
  return {
    providerKey: input.providerKey,
    dedupeKey: input.dedupeKey,
    firstSeenAt: new Date(referenceTime).toISOString(),
    expiresAt: new Date(referenceTime + ttlMs).toISOString()
  };
}

function toScopedKey(providerKey: ProviderKey, dedupeKey: string): string {
  return `${providerKey}:${dedupeKey}`;
}

function assertPositiveTtl(ttlMs: number, field: string): void {
  if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
}
