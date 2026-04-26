import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DeliveryTarget, JsonRecord, ProviderKey } from '../core/contracts.js';

export const PENDING_STORE_STATE_VERSION = 'adapter-feishu-pending-store-v1';

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
  statePath?: string;
}

export interface PendingStore {
  put(input: PendingActionInput): PendingActionRecord;
  get(providerKey: ProviderKey, pendingId: string): PendingActionRecord | undefined;
  consume(providerKey: ProviderKey, pendingId: string): PendingActionRecord | undefined;
  delete(providerKey: ProviderKey, pendingId: string): boolean;
  list(providerKey?: ProviderKey): PendingActionRecord[];
}

interface PendingStoreStateFile {
  version: typeof PENDING_STORE_STATE_VERSION;
  records: PendingActionRecord[];
}

export function createPendingStore(options: PendingStoreOptions): PendingStore {
  assertPositiveTtl(options.ttlMs, 'ttlMs');
  const now = options.now ?? Date.now;
  const idGenerator = options.idGenerator ?? randomUUID;
  const records = loadRecords(options.statePath);

  function persist(): void {
    if (!options.statePath) {
      return;
    }
    persistRecords(options.statePath, [...records.values()]);
  }

  function pruneExpired(referenceTime: number): void {
    let pruned = false;
    for (const [key, record] of records.entries()) {
      if (Date.parse(record.expiresAt) <= referenceTime) {
        records.delete(key);
        pruned = true;
      }
    }

    if (pruned) {
      persist();
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
      persist();
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
      persist();
      return record;
    },
    delete(providerKey, pendingId) {
      const deleted = records.delete(toScopedKey(providerKey, pendingId));
      if (deleted) {
        persist();
      }
      return deleted;
    },
    list(providerKey) {
      const referenceTime = now();
      pruneExpired(referenceTime);
      return [...records.values()].filter((record) => !providerKey || record.providerKey === providerKey);
    }
  };
}

function loadRecords(statePath: string | undefined): Map<string, PendingActionRecord> {
  const records = new Map<string, PendingActionRecord>();
  if (!statePath) {
    return records;
  }

  let raw: string;
  try {
    raw = readFileSync(statePath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return records;
    }
    throw new Error(`Failed to load ADAPTER_FEISHU_PENDING_STATE_PATH: ${errorMessage(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(`Invalid ADAPTER_FEISHU_PENDING_STATE_PATH JSON: ${errorMessage(error)}`);
  }

  if (!isRecord(parsed) || parsed.version !== PENDING_STORE_STATE_VERSION || !Array.isArray(parsed.records)) {
    throw new Error('Invalid ADAPTER_FEISHU_PENDING_STATE_PATH state file');
  }

  for (const candidate of parsed.records) {
    if (!isPendingActionRecord(candidate)) {
      throw new Error('Invalid ADAPTER_FEISHU_PENDING_STATE_PATH pending record');
    }
    records.set(toScopedKey(candidate.providerKey, candidate.pendingId), candidate);
  }

  return records;
}

function persistRecords(statePath: string, records: PendingActionRecord[]): void {
  mkdirSync(dirname(statePath), { recursive: true });
  const stateFile: PendingStoreStateFile = {
    version: PENDING_STORE_STATE_VERSION,
    records
  };
  const temporaryPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(stateFile, null, 2)}\n`, 'utf8');
  renameSync(temporaryPath, statePath);
}

function isPendingActionRecord(value: unknown): value is PendingActionRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    hasNonEmptyString(value.providerKey) &&
    hasNonEmptyString(value.pendingId) &&
    hasNonEmptyString(value.actionId) &&
    isRecord(value.payload) &&
    (value.target === undefined || isRecord(value.target)) &&
    (value.metadata === undefined || isRecord(value.metadata)) &&
    hasValidDateString(value.createdAt) &&
    hasValidDateString(value.expiresAt)
  );
}

function toScopedKey(providerKey: ProviderKey, pendingId: string): string {
  return `${providerKey}:${pendingId}`;
}

function assertPositiveTtl(ttlMs: number, field: string): void {
  if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function hasValidDateString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown_error';
}
