import { describe, expect, it, vi } from 'vitest';
import { createPmsAgentHttpTurnForwarder } from '../../src/pmsAgent/forwarder.js';
import type { InboundTurn } from '../../src/core/contracts.js';

const turn: InboundTurn = {
  turnId: 'turn-1',
  channel: 'feishu',
  intent: 'command',
  receivedAt: '2026-05-06T12:00:00.000Z',
  actor: { openId: 'ou_1', tenantKey: 'tenant_1' },
  target: { channel: 'feishu', chatId: 'oc_1', messageId: 'om_1' },
  text: '查房态',
  rawEvent: {}
};

describe('createPmsAgentHttpTurnForwarder', () => {
  it('posts FeishuTurnInput directly to /v1/feishu-turn with PMS Agent auth', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: 'text', text: '可以预订。' }), { status: 200 }));
    const forwarder = createPmsAgentHttpTurnForwarder({
      url: 'http://127.0.0.1:8795/v1/feishu-turn',
      token: 'agent-token-1',
      fetchImpl
    });

    const result = await forwarder.forwardTurn(turn);

    expect(result.result).toEqual({ type: 'text', text: '可以预订。' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8795/v1/feishu-turn');
    expect(init?.headers).toMatchObject({
      'content-type': 'application/json',
      'X-PMS-AGENT-TOKEN': 'agent-token-1'
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      channel: 'feishu',
      tenantId: 'tenant_1',
      sessionId: 'oc_1',
      messageId: 'om_1',
      actor: { role: 'customer', id: 'ou_1' },
      message: { text: '查房态' },
      receivedAt: '2026-05-06T12:00:00.000Z'
    });
  });

  it('does not accept old replies[] or wrapped result response shapes as PMS Agent output', async () => {
    const oldRepliesFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ replies: [{ type: 'text', text: 'legacy' }] }), { status: 200 }));
    const wrappedResultFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: { type: 'text', text: 'wrapped' } }), { status: 200 }));

    await expect(createPmsAgentHttpTurnForwarder({
      url: 'http://127.0.0.1:8795/v1/feishu-turn',
      token: 'agent-token-1',
      fetchImpl: oldRepliesFetch
    }).forwardTurn(turn)).resolves.toMatchObject({ result: undefined });

    await expect(createPmsAgentHttpTurnForwarder({
      url: 'http://127.0.0.1:8795/v1/feishu-turn',
      token: 'agent-token-1',
      fetchImpl: wrappedResultFetch
    }).forwardTurn(turn)).resolves.toMatchObject({ result: undefined });
  });

  it('rejects approval-card results without the callback cardPayloadRef', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      type: 'approval_card',
      card: {
        type: 'pms_pending_action_card',
        ref: {
          type: 'pms_pending_action',
          pendingActionRef: 'pending-action-1',
          propertyId: 'property-small-hotel',
          action: 'reservation_confirm'
        },
        title: '确认预订',
        summary: '请确认。',
        confirmLabel: '确认',
        cancelLabel: '取消'
      }
    }), { status: 200 }));

    await expect(createPmsAgentHttpTurnForwarder({
      url: 'http://127.0.0.1:8795/v1/feishu-turn',
      token: 'agent-token-1',
      fetchImpl
    }).forwardTurn(turn)).resolves.toMatchObject({ result: undefined });
  });

  it('rejects approval-card results without a platform pending-action ref', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      type: 'approval_card',
      card: {
        type: 'pms_pending_action_card',
        ref: {
          type: 'pms_pending_action',
          cardPayloadRef: 'card-payload-1',
          propertyId: 'property-small-hotel',
          action: 'reservation_confirm'
        },
        title: '确认预订',
        summary: '请确认。',
        confirmLabel: '确认',
        cancelLabel: '取消'
      }
    }), { status: 200 }));

    await expect(createPmsAgentHttpTurnForwarder({
      url: 'http://127.0.0.1:8795/v1/feishu-turn',
      token: 'agent-token-1',
      fetchImpl
    }).forwardTurn(turn)).resolves.toMatchObject({ result: undefined });
  });
});
