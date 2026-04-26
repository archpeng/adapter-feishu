import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPendingStore } from '../../src/state/pendingStore.js';

describe('createPendingStore', () => {
  it('stores, resolves, and consumes pending actions within a provider scope', () => {
    let now = 1_000;
    const store = createPendingStore({
      ttlMs: 2_000,
      now: () => now,
      idGenerator: () => 'pending-1'
    });

    const record = store.put({
      providerKey: 'warning-agent',
      actionId: 'acknowledge',
      payload: {
        reportId: 'report-1'
      }
    });

    expect(store.get('warning-agent', 'pending-1')).toEqual(record);
    expect(store.get('ops-bot', 'pending-1')).toBeUndefined();
    expect(store.consume('warning-agent', 'pending-1')).toEqual(record);
    expect(store.get('warning-agent', 'pending-1')).toBeUndefined();

    now = 4_000;
    expect(store.list('warning-agent')).toEqual([]);
  });

  it('persists pending actions across store recreation when a state path is configured', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'adapter-feishu-pending-store-'));
    const statePath = join(tmp, 'pending-actions.json');

    try {
      const firstStore = createPendingStore({
        ttlMs: 10_000,
        now: () => 1_000,
        idGenerator: () => 'pending-durable-1',
        statePath
      });
      const record = firstStore.put({
        providerKey: 'pms-checkout',
        actionId: 'pms.checkout.confirm',
        payload: { roomId: 'room-1001' },
        target: { channel: 'feishu', chatId: 'oc-chat-1' }
      });

      const restartedStore = createPendingStore({
        ttlMs: 10_000,
        now: () => 2_000,
        statePath
      });
      expect(restartedStore.get('pms-checkout', 'pending-durable-1')).toEqual(record);
      expect(restartedStore.consume('pms-checkout', 'pending-durable-1')).toEqual(record);

      const afterConsumeRestart = createPendingStore({
        ttlMs: 10_000,
        now: () => 3_000,
        statePath
      });
      expect(afterConsumeRestart.get('pms-checkout', 'pending-durable-1')).toBeUndefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('expires stale pending actions and only lists live records', () => {
    let now = 1_000;
    let counter = 0;
    const store = createPendingStore({
      ttlMs: 1_000,
      now: () => now,
      idGenerator: () => `pending-${++counter}`
    });

    const first = store.put({
      providerKey: 'warning-agent',
      actionId: 'approve',
      payload: { reportId: 'report-1' }
    });

    now = 1_500;
    const second = store.put({
      providerKey: 'warning-agent',
      actionId: 'reject',
      payload: { reportId: 'report-2' }
    });

    now = 2_100;

    expect(store.get('warning-agent', first.pendingId)).toBeUndefined();
    expect(store.list('warning-agent')).toEqual([second]);
  });
});
