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

const reservationGroupApprovalCard: AgentResult = {
  type: 'approval_card',
  card: {
    type: 'pms_pending_action_card',
    ref: {
      type: 'pms_pending_action',
      tenantId: 'tenant_1',
      pendingActionId: 'pending-action-legacy-group-1',
      pendingActionRef: 'pending-action-group-1',
      cardPayloadRef: 'card-payload-group-1',
      quoteRef: 'quote-group-1',
      propertyId: 'property-small-hotel',
      action: 'reservation_confirm'
    },
    title: '确认多房预订',
    summary: '请核对多房选择后确认。',
    confirmLabel: '确认',
    cancelLabel: '取消',
    reservationGroup: {
      guestDisplayName: 'Group Guest',
      arrivalDate: '2026-05-07',
      departureDate: '2026-05-09',
      quantity: 2,
      selections: [
        { roomId: 'room-1001', roomNumber: '1001', roomTypeId: 'villa-garden', roomType: '花园别墅' },
        { roomId: 'room-a2', roomNumber: 'A2', roomTypeId: 'villa-garden', roomType: '花园别墅' }
      ],
      quoteStatus: 'pricingUnsupported'
    }
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

  it('renders PMS Agent reservation-group approval cards without exposing raw PMS refs', () => {
    const pendingStore = createPendingStore({ ttlMs: 60_000 });
    const [notification] = pmsAgentResultNotifications({
      result: reservationGroupApprovalCard,
      turn,
      pendingStore,
      now: () => '2026-05-06T12:00:01.000Z'
    });

    expect(notification).toMatchObject({
      providerKey: PMS_AGENT_PROVIDER_KEY,
      title: '确认多房预订',
      bodyMarkdown: expect.stringContaining('PMS 当前未提供多房预订价格'),
      facts: [
        { label: '客人', value: 'Group Guest' },
        { label: '入住日期', value: '2026-05-07' },
        { label: '离店日期', value: '2026-05-09' },
        { label: '房间数量', value: '2' },
        { label: '房间 1', value: '1001 / 花园别墅' },
        { label: '房间 2', value: 'A2 / 花园别墅' },
        { label: '报价状态', value: 'PMS 暂不提供价格' }
      ],
      rawPayload: expect.objectContaining({
        reservationGroupCard: true,
        quoteStatus: 'pricingUnsupported',
        rawRefsLogged: false
      })
    });
    expect(notification.actions).toEqual([
      expect.objectContaining({ payload: expect.objectContaining({ operation: 'pms.pending_action.confirm' }) }),
      expect.objectContaining({ payload: expect.objectContaining({ operation: 'pms.pending_action.cancel' }) })
    ]);
    const visiblePayload = JSON.stringify(notification);
    expect(visiblePayload).not.toContain('pending-action-group-1');
    expect(visiblePayload).not.toContain('card-payload-group-1');
    expect(visiblePayload).not.toContain('quote-group-1');
    expect(visiblePayload).not.toContain('￥');
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
      clientToken: expect.any(String),
      requestFingerprint: expect.any(String),
      correlationId: expect.any(String),
      requestedAt: '2026-05-06T12:00:02.000Z',
      scope: {
        propertyId: 'property-small-hotel',
        channel: 'typed_card',
        userIdHash: expect.any(String)
      }
    });
    expect(body.pendingActionId).toBeUndefined();
  });

  it('posts PMS Agent approval-card cancel callbacks to the fixed platform cancel route', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 202 }));
    const callbackForwarder = createPmsCheckoutPlatformPendingActionCallbackForwarder({
      baseUrl: 'http://127.0.0.1:8791',
      token: 'platform-token-1',
      fetchImpl
    });
    const pendingStore = createPendingStore({ ttlMs: 60_000 });
    const [notification] = pmsAgentResultNotifications({ result: approvalCard, turn, pendingStore, now: () => '2026-05-06T12:00:01.000Z' });
    const action = notification.actions?.[1];

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
      'http://127.0.0.1:8791/v1/pms/pending-actions/cancel',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
    expect(body).toMatchObject({
      operation: 'pms.pending_action.cancel',
      pendingActionRef: 'pending-action-1',
      cardPayloadRef: 'card-payload-1',
      reason: expect.stringContaining('取消'),
      scope: {
        propertyId: 'property-small-hotel',
        channel: 'typed_card',
        userIdHash: expect.any(String)
      },
      clientToken: expect.any(String),
      requestFingerprint: expect.any(String),
      correlationId: expect.any(String),
      requestedAt: '2026-05-06T12:00:02.000Z'
    });
  });
});
