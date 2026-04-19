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
