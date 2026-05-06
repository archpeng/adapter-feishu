import { describe, expect, it } from 'vitest';
import { inboundTurnToFeishuTurnInput } from '../../src/pmsAgent/turn.js';
import type { InboundTurn } from '../../src/core/contracts.js';

const turn: InboundTurn = {
  turnId: 'turn-1',
  channel: 'feishu',
  intent: 'command',
  receivedAt: '2026-05-06T12:00:00.000Z',
  actor: { openId: 'ou_1', tenantKey: 'tenant_1', displayName: 'Guest' },
  target: { channel: 'feishu', chatId: 'oc_1', messageId: 'om_1' },
  text: ' 查房态 ',
  rawEvent: {},
  metadata: { actorRole: 'customer' }
};

describe('inboundTurnToFeishuTurnInput', () => {
  it('maps an adapter InboundTurn to the PMS Agent FeishuTurnInput contract', () => {
    expect(inboundTurnToFeishuTurnInput(turn)).toEqual({
      channel: 'feishu',
      tenantId: 'tenant_1',
      sessionId: 'oc_1',
      messageId: 'om_1',
      actor: { role: 'customer', id: 'ou_1', displayName: 'Guest' },
      message: { text: '查房态' },
      receivedAt: '2026-05-06T12:00:00.000Z'
    });
  });

  it('does not synthesize invalid required PMS Agent fields', () => {
    expect(inboundTurnToFeishuTurnInput({ ...turn, text: ' ' })).toBeUndefined();
    expect(inboundTurnToFeishuTurnInput({ ...turn, actor: undefined })).toBeUndefined();
  });
});
