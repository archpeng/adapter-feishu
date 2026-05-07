import { describe, expect, it, vi } from 'vitest';
import { dispatchCardActionRequest } from '../../src/server/cardAction.js';
import { pmsAgentResultNotifications } from '../../src/pmsAgent/delivery.js';
import { createPmsCheckoutPlatformPendingActionCallbackForwarder } from '../../src/providers/pms-checkout/index.js';
import {
  PMS_AGENT_PENDING_ACTION_ID,
  PMS_AGENT_PENDING_ACTION_PROVIDER_KEY,
  PMS_AGENT_PROVIDER_KEY,
  type AgentResult
} from '../../src/pmsAgent/contracts.js';
import type { InboundTurn } from '../../src/core/contracts.js';
import { createPendingStore } from '../../src/state/pendingStore.js';
import { createProviderRegistry } from '../../src/providers/registry.js';
import { createProviderRouter } from '../../src/providers/router.js';

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

const approvalCard: AgentResult = {
  type: 'approval_card',
  card: {
    type: 'pms_pending_action_card',
    ref: {
      type: 'pms_pending_action',
      tenantId: 'tenant_1',
      pendingActionId: 'pending-action-legacy-1',
      pendingActionRef: 'pending-action-1',
      cardPayloadRef: 'card-payload-1',
      quoteRef: 'quote-1',
      propertyId: 'property-small-hotel',
      action: 'reservation_confirm'
    },
    title: '确认预订',
    summary: '点击确认后转交 PMS pending-action。',
    confirmLabel: '确认',
    cancelLabel: '取消'
  }
};

const variants: AgentResult[] = [
  { type: 'text', text: '今晚可订。' },
  { type: 'refusal', reason: 'policy', message: '该操作需要审批。' },
  { type: 'proposal', proposalId: 'proposal_1', title: '审批方案', summary: '请审批后执行。', approvalRequired: true },
  approvalCard
];

describe('pmsAgentResultNotifications', () => {
  it('maps every AgentResult variant to Feishu-deliverable notifications', () => {
    const pendingStore = createPendingStore({ ttlMs: 60_000 });

    for (const result of variants) {
      const notifications = pmsAgentResultNotifications({ result, turn, pendingStore, now: () => '2026-05-06T12:00:01.000Z' });
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        providerKey: PMS_AGENT_PROVIDER_KEY,
        target: turn.target
      });
    }

    const pending = pendingStore.list(PMS_AGENT_PENDING_ACTION_PROVIDER_KEY)[0];
    expect(pending).toMatchObject({
      actionId: PMS_AGENT_PENDING_ACTION_ID,
      target: turn.target,
      payload: {
        pendingAction: {
          pendingActionRef: 'pending-action-1',
          cardPayloadRef: 'card-payload-1',
          quoteRef: 'quote-1',
          propertyId: 'property-small-hotel'
        },
        callbackOwner: 'adapter-feishu',
        targetOwner: 'pms-platform',
        naturalLanguageConfirmAllowed: false
      }
    });
  });

  it('forwards PMS approval-card clicks through the adapter-owned pending-action callback path', async () => {
    const pendingStore = createPendingStore({ ttlMs: 60_000 });
    const [notification] = pmsAgentResultNotifications({ result: approvalCard, turn, pendingStore, now: () => '2026-05-06T12:00:01.000Z' });
    const action = notification.actions?.[0];
    const callbackForwarder = {
      forwardCallback: vi.fn().mockResolvedValue({ statusCode: 202, body: { ok: true } })
    };

    const response = await dispatchCardActionRequest({
      method: 'POST',
      pathname: '/providers/card-action',
      rawBody: JSON.stringify({
        token: 'verification-token-1',
        action: { value: action?.payload },
        operator: { open_id: 'ou_1' }
      })
    }, {
      providerRouter: createProviderRouter(createProviderRegistry({ allowedProviderKeys: ['warning-agent'] }), {}),
      pendingStore,
      replySink: { sendNotification: vi.fn() },
      callbackForwarder,
      verificationToken: 'verification-token-1',
      now: () => '2026-05-06T12:00:02.000Z'
    });

    expect(response).toEqual({
      statusCode: 200,
      body: {
        code: 0,
        providerKey: PMS_AGENT_PENDING_ACTION_PROVIDER_KEY,
        status: 'accepted'
      }
    });
    expect(callbackForwarder.forwardCallback).toHaveBeenCalledWith(expect.objectContaining({
      envelope: expect.objectContaining({
        source: 'adapter-feishu',
        platformPendingAction: expect.objectContaining({
          operation: 'pms.pending_action.confirm',
          request: expect.objectContaining({
            operation: 'pms.pending_action.confirm',
            pendingActionRef: 'pending-action-1',
            cardPayloadRef: 'card-payload-1',
            scope: expect.objectContaining({
              propertyId: 'property-small-hotel',
              channel: 'typed_card'
            })
          }),
          routing: expect.objectContaining({ owner: 'pms-platform' })
        }),
        orchestrator: expect.objectContaining({
          callbackOwner: 'adapter-feishu',
          targetOwner: 'pms-platform',
          naturalLanguageConfirmAllowed: false
        })
      })
    }));
    const request = callbackForwarder.forwardCallback.mock.calls[0][0].envelope.platformPendingAction.request;
    expect(request.pendingActionId).toBeUndefined();
    expect(request.tenantId).toBeUndefined();
  });

  it('posts PMS Agent approval-card callbacks to fixed platform routes with typed refs', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 202 }));
    const callbackForwarder = createPmsCheckoutPlatformPendingActionCallbackForwarder({
      baseUrl: 'http://127.0.0.1:8791',
      token: 'platform-token-1',
      fetchImpl
    });
    const pendingStore = createPendingStore({ ttlMs: 60_000 });
    const [notification] = pmsAgentResultNotifications({ result: approvalCard, turn, pendingStore, now: () => '2026-05-06T12:00:01.000Z' });
    const action = notification.actions?.[0];

    const response = await dispatchCardActionRequest({
      method: 'POST',
      pathname: '/providers/card-action',
      rawBody: JSON.stringify({
        token: 'verification-token-1',
        action: { value: action?.payload },
        operator: { open_id: 'ou_1' }
      })
    }, {
      providerRouter: createProviderRouter(createProviderRegistry({ allowedProviderKeys: ['warning-agent'] }), {}),
      pendingStore,
      replySink: { sendNotification: vi.fn() },
      callbackForwarder,
      verificationToken: 'verification-token-1',
      now: () => '2026-05-06T12:00:02.000Z'
    });

    expect(response.statusCode).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:8791/v1/pms/pending-actions/confirm',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer platform-token-1' })
      })
    );
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
    expect(body).toMatchObject({
      operation: 'pms.pending_action.confirm',
      pendingActionRef: 'pending-action-1',
      cardPayloadRef: 'card-payload-1',
      scope: {
        propertyId: 'property-small-hotel',
        channel: 'typed_card'
      }
    });
    expect(body.pendingActionId).toBeUndefined();
  });
});
