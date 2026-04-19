import { randomUUID } from 'node:crypto';
import type { DeliveryTarget, JsonRecord, ProviderKey } from '../core/contracts.js';

export interface PendingActionInput {
  providerKey: ProviderKey;
  actionId: string;
  payload: JsonRecord;
  target?: DeliveryTarget;
  metadata?: JsonRecord;
  pendingId?: string;
}

export interface PendingActionRecord extends Omit<PendingActionInput, 'pendingId'> {
  pendingId: string;
  createdAt: string;
  expiresAt: string;
}

export interface PendingStoreOptions {
  ttlMs: number;
  now?: () => number;
  idGenerator?: () => string;
}

export interface PendingStore {
  put(input: PendingActionInput): PendingActionRecord;
  get(providerKey: ProviderKey, pendingId: string): PendingActionRecord | undefined;
  consume(providerKey: ProviderKey, pendingId: string): PendingActionRecord | undefined;
  delete(providerKey: ProviderKey, pendingId: string): boolean;
  list(providerKey?: ProviderKey): PendingActionRecord[];
}

export function createPendingStore(options: PendingStoreOptions): PendingStore {
  assertPositiveTtl(options.ttlMs, 'ttlMs');
  const now = options.now ?? Date.now;
  const idGenerator = options.idGenerator ?? randomUUID;
  const records = new Map<string, PendingActionRecord>();

  function pruneExpired(referenceTime: number): void {
    for (const [key, record] of records.entries()) {
      if (Date.parse(record.expiresAt) <= referenceTime) {
        records.delete(key);
      }
    }
  }

  return {
    put(input) {
      const referenceTime = now();
      pruneExpired(referenceTime);

      const pendingId = input.pendingId ?? idGenerator();
      const record: PendingActionRecord = {
        providerKey: input.providerKey,
        pendingId,
        actionId: input.actionId,
        payload: input.payload,
        target: input.target,
        metadata: input.metadata,
        createdAt: new Date(referenceTime).toISOString(),
        expiresAt: new Date(referenceTime + options.ttlMs).toISOString()
      };

      records.set(toScopedKey(record.providerKey, record.pendingId), record);
      return record;
    },
    get(providerKey, pendingId) {
      const referenceTime = now();
      pruneExpired(referenceTime);
      return records.get(toScopedKey(providerKey, pendingId));
    },
    consume(providerKey, pendingId) {
      const referenceTime = now();
      pruneExpired(referenceTime);
      const key = toScopedKey(providerKey, pendingId);
      const record = records.get(key);
      if (!record) {
        return undefined;
      }
      records.delete(key);
      return record;
    },
    delete(providerKey, pendingId) {
      return records.delete(toScopedKey(providerKey, pendingId));
    },
    list(providerKey) {
      const referenceTime = now();
      pruneExpired(referenceTime);
      return [...records.values()].filter((record) => !providerKey || record.providerKey === providerKey);
    }
  };
}

function toScopedKey(providerKey: ProviderKey, pendingId: string): string {
  return `${providerKey}:${pendingId}`;
}

function assertPositiveTtl(ttlMs: number, field: string): void {
  if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
}
