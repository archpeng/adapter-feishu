import { describe, expect, it } from 'vitest';
import { createAlertDeduper } from '../../src/state/dedupe.js';

describe('createAlertDeduper', () => {
  it('dedupes repeated keys within the same provider until the TTL expires', () => {
    let now = 1_000;
    const deduper = createAlertDeduper({
      ttlMs: 1_000,
      now: () => now
    });

    const first = deduper.markSeen({ providerKey: 'warning-agent', dedupeKey: 'incident-1' });
    const second = deduper.markSeen({ providerKey: 'warning-agent', dedupeKey: 'incident-1' });

    now = 2_100;
    const third = deduper.markSeen({ providerKey: 'warning-agent', dedupeKey: 'incident-1' });

    expect(first.isDuplicate).toBe(false);
    expect(second.isDuplicate).toBe(true);
    expect(third.isDuplicate).toBe(false);
    expect(deduper.has({ providerKey: 'warning-agent', dedupeKey: 'incident-1' })).toBe(true);
  });

  it('keeps dedupe state scoped to each provider', () => {
    const deduper = createAlertDeduper({ ttlMs: 1_000, now: () => 1_000 });

    const warningAgent = deduper.markSeen({ providerKey: 'warning-agent', dedupeKey: 'incident-1' });
    const opsBot = deduper.markSeen({ providerKey: 'ops-bot', dedupeKey: 'incident-1' });

    expect(warningAgent.isDuplicate).toBe(false);
    expect(opsBot.isDuplicate).toBe(false);
    expect(deduper.listActive('warning-agent')).toHaveLength(1);
    expect(deduper.listActive('ops-bot')).toHaveLength(1);
  });
});
