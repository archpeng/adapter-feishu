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

    expect(response).toMatchObject({
      statusCode: 200,
      body: {
        code: 0,
        providerKey: PMS_AGENT_PENDING_ACTION_PROVIDER_KEY,
        status: 'accepted',
        toast: expect.objectContaining({ type: 'success' }),
        card: expect.any(Object)
      }
    });
    expect(JSON.stringify(response.body.card)).not.toContain('"tag":"action"');
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

  it('updates the original PMS approval card to a terminal no-action state after confirmed callback', async () => {
    const pendingStore = createPendingStore({ ttlMs: 60_000 });
    const [notification] = pmsAgentResultNotifications({ result: approvalCard, turn, pendingStore, now: () => '2026-05-06T12:00:01.000Z' });
    const action = notification.actions?.[0];
    const updateNotification = vi.fn().mockResolvedValue({ providerKey: PMS_AGENT_PROVIDER_KEY, deliveryId: 'delivery-terminal', channel: 'feishu', status: 'delivered' });
    const sendNotification = vi.fn();
    const callbackForwarder = {
      forwardCallback: vi.fn().mockResolvedValue({
        statusCode: 202,
        body: {
          ok: true,
          mutationStatus: 'deferred',
          idempotencyStatus: 'confirmed',
          pendingAction: { workflowType: 'reservation', status: 'confirmed', mutationStatus: 'deferred' }
        }
      })
    };

    const response = await dispatchCardActionRequest({
      method: 'POST',
      pathname: '/providers/card-action',
      rawBody: JSON.stringify({
        token: 'verification-token-1',
        open_message_id: 'om-card-1',
        action: { value: action?.payload },
        operator: { open_id: 'ou_1' }
      })
    }, {
      providerRouter: createProviderRouter(createProviderRegistry({ allowedProviderKeys: ['warning-agent'] }), {}),
      pendingStore,
      replySink: { sendNotification, updateNotification },
      callbackForwarder,
      verificationToken: 'verification-token-1',
      now: () => '2026-05-06T12:00:02.000Z'
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      toast: { type: 'success', content: '预订草稿已确认' },
      card: expect.any(Object)
    });
    expect(JSON.stringify(response.body.card)).not.toContain('"tag":"action"');
    expect(updateNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: '预订草稿已确认',
      summary: expect.stringContaining('pending-action 已确认'),
      target: expect.objectContaining({ messageId: 'om-card-1' }),
      facts: expect.arrayContaining([
        { label: '状态', value: 'confirmed' },
        { label: '持久化语义', value: 'deferred' }
      ])
    }));
    expect(updateNotification.mock.calls[0][0].actions).toBeUndefined();
    expect(sendNotification).not.toHaveBeenCalled();
    expect(pendingStore.get(PMS_AGENT_PENDING_ACTION_PROVIDER_KEY, String(action?.payload?.pendingId))).toBeUndefined();
  });

  it('renders final reservation creation when platform callback returns committed reservation data', async () => {
    const pendingStore = createPendingStore({ ttlMs: 60_000 });
    const [notification] = pmsAgentResultNotifications({ result: approvalCard, turn, pendingStore, now: () => '2026-05-06T12:00:01.000Z' });
    const action = notification.actions?.[0];
    const updateNotification = vi.fn().mockResolvedValue({ providerKey: PMS_AGENT_PROVIDER_KEY, deliveryId: 'delivery-terminal', channel: 'feishu', status: 'delivered' });
    const callbackForwarder = {
      forwardCallback: vi.fn().mockResolvedValue({
        statusCode: 202,
        body: {
          ok: true,
          mutationStatus: 'committed',
          idempotencyStatus: 'confirmed',
          pendingAction: { workflowType: 'reservation', status: 'confirmed', mutationStatus: 'committed' },
          reservation: { reservationCode: 'R-1234ABCD5678EF90', roomNumber: '1001' }
        }
      })
    };

    const response = await dispatchCardActionRequest({
      method: 'POST',
      pathname: '/providers/card-action',
      rawBody: JSON.stringify({
        token: 'verification-token-1',
        open_message_id: 'om-card-1',
        action: { value: action?.payload },
        operator: { open_id: 'ou_1' }
      })
    }, {
      providerRouter: createProviderRouter(createProviderRegistry({ allowedProviderKeys: ['warning-agent'] }), {}),
      pendingStore,
      replySink: { sendNotification: vi.fn(), updateNotification },
      callbackForwarder,
      verificationToken: 'verification-token-1',
      now: () => '2026-05-06T12:00:02.000Z'
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      toast: { type: 'success', content: '预订已创建' }
    });
    expect(updateNotification).toHaveBeenCalledWith(expect.objectContaining({
      title: '预订已创建',
      summary: expect.stringContaining('创建最终预订'),
      bodyMarkdown: expect.stringContaining('预订数据会通过 PMS 投影同步到飞书多维表'),
      facts: expect.arrayContaining([
        { label: '持久化语义', value: 'committed' },
        { label: '预订号', value: 'R-1234ABCD5678EF90' },
        { label: '房号', value: '1001' }
      ])
    }));
    expect(updateNotification.mock.calls[0][0].actions).toBeUndefined();
  });

  it('returns a stale terminal card instead of 404 for repeated PMS approval-card clicks', async () => {
    const pendingStore = createPendingStore({ ttlMs: 60_000 });
    const response = await dispatchCardActionRequest({
      method: 'POST',
      pathname: '/providers/card-action',
      rawBody: JSON.stringify({
        token: 'verification-token-1',
        action: {
          value: {
            providerKey: PMS_AGENT_PENDING_ACTION_PROVIDER_KEY,
            pendingId: 'already-consumed-pending',
            actionId: PMS_AGENT_PENDING_ACTION_ID,
            operation: 'pms.pending_action.confirm'
          }
        },
        operator: { open_id: 'ou_1' }
      })
    }, {
      providerRouter: createProviderRouter(createProviderRegistry({ allowedProviderKeys: ['warning-agent'] }), {}),
      pendingStore,
      replySink: { sendNotification: vi.fn() },
      callbackForwarder: { forwardCallback: vi.fn() },
      verificationToken: 'verification-token-1',
      now: () => '2026-05-06T12:00:02.000Z'
    });

    expect(response).toMatchObject({
      statusCode: 200,
      body: {
        code: 0,
        providerKey: PMS_AGENT_PENDING_ACTION_PROVIDER_KEY,
        status: 'ignored',
        message: 'pending_not_found_or_already_processed',
        toast: {
          type: 'info',
          content: '该卡片已处理或已过期。'
        },
        card: expect.any(Object)
      }
    });
    expect(JSON.stringify(response.body.card)).not.toContain('"tag":"action"');
  });

  it('does not consume or update PMS approval cards when platform rejects the callback body', async () => {
    const pendingStore = createPendingStore({ ttlMs: 60_000 });
    const [notification] = pmsAgentResultNotifications({ result: approvalCard, turn, pendingStore, now: () => '2026-05-06T12:00:01.000Z' });
    const action = notification.actions?.[0];
    const updateNotification = vi.fn();
    const callbackForwarder = {
      forwardCallback: vi.fn().mockResolvedValue({ statusCode: 200, body: { ok: false, errors: [{ code: 'PENDING_ACTION_NOT_ACTIVE' }] } })
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
      replySink: { sendNotification: vi.fn(), updateNotification },
      callbackForwarder,
      verificationToken: 'verification-token-1',
      now: () => '2026-05-06T12:00:02.000Z'
    });

    expect(response.statusCode).toBe(409);
    expect(updateNotification).not.toHaveBeenCalled();
    expect(pendingStore.get(PMS_AGENT_PENDING_ACTION_PROVIDER_KEY, String(action?.payload?.pendingId))).toBeDefined();
  });

  it('sends a terminal fallback message when Feishu card update fails after platform confirmation', async () => {
    const pendingStore = createPendingStore({ ttlMs: 60_000 });
    const [notification] = pmsAgentResultNotifications({ result: approvalCard, turn, pendingStore, now: () => '2026-05-06T12:00:01.000Z' });
    const action = notification.actions?.[0];
    const sendNotification = vi.fn().mockResolvedValue({ providerKey: PMS_AGENT_PROVIDER_KEY, deliveryId: 'delivery-fallback', channel: 'feishu', status: 'delivered' });
    const updateNotification = vi.fn().mockRejectedValue(new Error('feishu card patch failed'));
    const callbackForwarder = {
      forwardCallback: vi.fn().mockResolvedValue({
        statusCode: 202,
        body: { ok: true, mutationStatus: 'deferred', pendingAction: { status: 'confirmed', mutationStatus: 'deferred' } }
      })
    };

    const response = await dispatchCardActionRequest({
      method: 'POST',
      pathname: '/providers/card-action',
      rawBody: JSON.stringify({
        token: 'verification-token-1',
        open_message_id: 'om-card-1',
        action: { value: action?.payload },
        operator: { open_id: 'ou_1' }
      })
    }, {
      providerRouter: createProviderRouter(createProviderRegistry({ allowedProviderKeys: ['warning-agent'] }), {}),
      pendingStore,
      replySink: { sendNotification, updateNotification },
      callbackForwarder,
      verificationToken: 'verification-token-1',
      now: () => '2026-05-06T12:00:02.000Z'
    });

    expect(response.statusCode).toBe(200);
    expect(updateNotification).toHaveBeenCalledOnce();
    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({ title: '预订草稿已确认' }));
    expect(sendNotification.mock.calls[0][0].actions).toBeUndefined();
    expect(pendingStore.get(PMS_AGENT_PENDING_ACTION_PROVIDER_KEY, String(action?.payload?.pendingId))).toBeUndefined();
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
