import { describe, expect, it, vi } from 'vitest';
import {
  createPmsCheckoutHttpCallbackForwarder,
  createPmsCheckoutProvider,
  PMS_CHECKOUT_PROVIDER_KEY
} from '../../src/providers/pms-checkout/index.js';
import { createProviderRegistry, registerProvider } from '../../src/providers/registry.js';
import { createProviderRouter } from '../../src/providers/router.js';
import { dispatchCardActionRequest } from '../../src/server/cardAction.js';
import { dispatchProviderWebhookRequest } from '../../src/server/providerWebhook.js';
import { createPendingStore } from '../../src/state/pendingStore.js';

function dryRunProjection() {
  return {
    providerKey: PMS_CHECKOUT_PROVIDER_KEY,
    reason: 'Render PMS checkout dry-run for human confirmation.',
    requestedAt: '2026-04-26T00:00:02.000Z',
    feishuProjection: {
      providerKey: PMS_CHECKOUT_PROVIDER_KEY,
      projectionKind: 'dryRunCard',
      canonicalSource: 'pms-platform',
      target: {
        kind: 'chat',
        id: 'oc-chat-1'
      },
      payload: {
        roomId: 'room-1001',
        roomNumber: '1001',
        currentStatus: { occupancy: 'dueOut', cleaning: 'clean', sale: 'sellable' },
        nextStatus: { occupancy: 'vacant', cleaning: 'dirty', sale: 'sellable' },
        taskPreview: 'Create checkout-cleaning housekeeping task.',
        requestFingerprint: 'sha256:pms-checkout-dry-run-1001',
        dryRunIdentity: {
          mode: 'dryRun',
          idempotencyKey: 'idem-pms-checkout-1001-dry-run',
          requestFingerprint: 'sha256:pms-checkout-dry-run-1001'
        },
        confirmAction: {
          actionId: 'pms.checkout.confirm',
          confirmMode: 'confirm',
          idempotencyKey: 'idem-pms-checkout-1001-confirm',
          requestFingerprint: 'sha256:pms-checkout-confirm-1001',
          callbackEnvelope: 'pms-checkout-confirm-callback-forward.v1',
          forwardTo: {
            owner: 'ai-pms',
            handler: 'ai_pms.pms_checkout.confirm_callback'
          }
        },
        actor: { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' },
        correlationId: 'corr-pms-checkout-1001',
        idempotencyKey: 'idem-pms-checkout-1001-dry-run'
      }
    }
  };
}

function resultProjection() {
  return {
    providerKey: PMS_CHECKOUT_PROVIDER_KEY,
    requestedAt: '2026-04-26T00:01:02.000Z',
    feishuProjection: {
      providerKey: PMS_CHECKOUT_PROVIDER_KEY,
      projectionKind: 'resultCard',
      canonicalSource: 'pms-platform',
      target: { kind: 'chat', id: 'oc-chat-1' },
      payload: {
        roomId: 'room-1001',
        roomNumber: '1001',
        currentStatus: { occupancy: 'dueOut', cleaning: 'clean', sale: 'sellable' },
        nextStatus: { occupancy: 'vacant', cleaning: 'dirty', sale: 'sellable' },
        actor: { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' },
        correlationId: 'corr-pms-checkout-1001',
        idempotencyKey: 'idem-pms-checkout-1001-confirm',
        housekeepingTaskId: 'task-checkout-1001',
        auditId: 'audit-checkout-1001',
        eventTypes: ['RoomCheckedOut', 'HousekeepingTaskCreated']
      }
    }
  };
}

function failedResultProjection() {
  const projection = resultProjection();
  projection.feishuProjection.payload = {
    roomId: 'room-1001',
    roomNumber: '1001',
    actor: { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' },
    correlationId: 'corr-pms-checkout-1001',
    idempotencyKey: 'idem-pms-checkout-1001-confirm',
    errors: [
      {
        code: 'ROOM_NOT_CHECKOUTABLE',
        message: 'Room is not in a checkoutable occupancy state.',
        field: 'room.occupancyStatus'
      }
    ]
  };
  return projection;
}

function createPmsRouter(callbackForwarder = { forwardCallback: vi.fn().mockResolvedValue({ statusCode: 202, body: { code: 0 } }) }) {
  const registry = createProviderRegistry({
    allowedProviderKeys: [PMS_CHECKOUT_PROVIDER_KEY]
  });
  registerProvider(registry, createPmsCheckoutProvider({ callbackForwarder }));
  return {
    router: createProviderRouter(registry),
    callbackForwarder
  };
}

describe('pms-checkout runtime provider', () => {
  it('validates dry-run projection payloads, persists pending action before delivery, and emits a confirm button', async () => {
    const replySink = {
      sendNotification: vi.fn().mockResolvedValue({
        providerKey: PMS_CHECKOUT_PROVIDER_KEY,
        deliveryId: 'delivery-pms-checkout-dry-run',
        channel: 'feishu',
        status: 'delivered'
      })
    };
    const pendingStore = createPendingStore({
      ttlMs: 10_000,
      now: () => 1_000,
      idGenerator: () => 'pending-1001'
    });
    const { router } = createPmsRouter();

    const response = await dispatchProviderWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/webhook',
        rawBody: JSON.stringify(dryRunProjection())
      },
      {
        providerRouter: router,
        replySink,
        pendingStore,
        now: () => '2026-04-26T00:00:02.000Z'
      }
    );

    expect(response).toEqual({
      statusCode: 202,
      body: {
        code: 0,
        providerKey: PMS_CHECKOUT_PROVIDER_KEY,
        status: 'delivered'
      }
    });
    expect(pendingStore.get(PMS_CHECKOUT_PROVIDER_KEY, 'pending-1001')).toMatchObject({
      providerKey: PMS_CHECKOUT_PROVIDER_KEY,
      actionId: 'pms.checkout.confirm',
      target: {
        channel: 'feishu',
        chatId: 'oc-chat-1'
      },
      payload: expect.objectContaining({
        roomId: 'room-1001',
        correlationId: 'corr-pms-checkout-1001'
      })
    });
    expect(replySink.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKey: PMS_CHECKOUT_PROVIDER_KEY,
        target: {
          channel: 'feishu',
          chatId: 'oc-chat-1'
        },
        actions: [
          expect.objectContaining({
            actionId: 'pms.checkout.confirm',
            payload: expect.objectContaining({
              pendingId: 'pending-1001',
              idempotencyKey: 'idem-pms-checkout-1001-confirm',
              requestFingerprint: 'sha256:pms-checkout-confirm-1001',
              dryRunIdentity: expect.objectContaining({
                idempotencyKey: 'idem-pms-checkout-1001-dry-run'
              }),
              confirmIdentity: expect.objectContaining({
                idempotencyKey: 'idem-pms-checkout-1001-confirm'
              })
            })
          })
        ]
      })
    );
  });

  it('delivers PMS result projections without creating pending state', async () => {
    const replySink = {
      sendNotification: vi.fn().mockResolvedValue({
        providerKey: PMS_CHECKOUT_PROVIDER_KEY,
        deliveryId: 'delivery-pms-checkout-result',
        channel: 'feishu',
        status: 'delivered'
      })
    };
    const pendingStore = createPendingStore({ ttlMs: 10_000 });
    const { router } = createPmsRouter();

    const response = await dispatchProviderWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/webhook',
        rawBody: JSON.stringify(resultProjection())
      },
      {
        providerRouter: router,
        replySink,
        pendingStore,
        now: () => '2026-04-26T00:01:02.000Z'
      }
    );

    expect(response.body).toMatchObject({
      code: 0,
      providerKey: PMS_CHECKOUT_PROVIDER_KEY,
      status: 'delivered'
    });
    expect(pendingStore.list(PMS_CHECKOUT_PROVIDER_KEY)).toEqual([]);
    expect(replySink.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Checkout complete: room 1001',
        facts: expect.arrayContaining([
          { label: 'Task', value: 'task-checkout-1001' },
          { label: 'Audit', value: 'audit-checkout-1001' },
          { label: 'Events', value: 'RoomCheckedOut, HousekeepingTaskCreated' }
        ])
      })
    );
  });

  it('delivers PMS failure result projections as structured Feishu feedback', async () => {
    const replySink = {
      sendNotification: vi.fn().mockResolvedValue({
        providerKey: PMS_CHECKOUT_PROVIDER_KEY,
        deliveryId: 'delivery-pms-checkout-result-failed',
        channel: 'feishu',
        status: 'delivered'
      })
    };
    const { router } = createPmsRouter();

    const response = await dispatchProviderWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/webhook',
        rawBody: JSON.stringify(failedResultProjection())
      },
      {
        providerRouter: router,
        replySink
      }
    );

    expect(response.body).toMatchObject({
      code: 0,
      providerKey: PMS_CHECKOUT_PROVIDER_KEY,
      status: 'delivered'
    });
    expect(replySink.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Checkout failed: room 1001',
        severity: 'warning',
        summary: 'ROOM_NOT_CHECKOUTABLE: Room is not in a checkoutable occupancy state.'
      })
    );
  });

  it('forwards typed confirm callbacks, consumes pending state, and rejects duplicate stale clicks', async () => {
    const replySink = {
      sendNotification: vi.fn().mockResolvedValue({
        providerKey: PMS_CHECKOUT_PROVIDER_KEY,
        deliveryId: 'delivery-pms-checkout-dry-run',
        channel: 'feishu',
        status: 'delivered'
      })
    };
    const pendingStore = createPendingStore({
      ttlMs: 10_000,
      now: () => 1_000,
      idGenerator: () => 'pending-1001'
    });
    const callbackForwarder = {
      forwardCallback: vi.fn().mockResolvedValue({ statusCode: 202, body: { code: 0 } })
    };
    const { router } = createPmsRouter(callbackForwarder);

    await dispatchProviderWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/webhook',
        rawBody: JSON.stringify(dryRunProjection())
      },
      {
        providerRouter: router,
        replySink,
        pendingStore,
        now: () => '2026-04-26T00:00:02.000Z'
      }
    );

    const actionPayload = replySink.sendNotification.mock.calls[0][0].actions[0].payload;
    const first = await dispatchCardActionRequest(
      {
        method: 'POST',
        pathname: '/providers/card-action',
        rawBody: JSON.stringify({
          action: { value: actionPayload },
          open_message_id: 'om_123',
          operator: {
            user_id: 'frontdesk-1',
            open_id: 'ou-frontdesk-1',
            name: 'Front Desk'
          }
        })
      },
      {
        providerRouter: router,
        pendingStore,
        replySink,
        now: () => '2026-04-26T00:01:00.000Z'
      }
    );
    const second = await dispatchCardActionRequest(
      {
        method: 'POST',
        pathname: '/providers/card-action',
        rawBody: JSON.stringify({
          action: { value: actionPayload },
          open_message_id: 'om_123'
        })
      },
      {
        providerRouter: router,
        pendingStore,
        replySink,
        now: () => '2026-04-26T00:01:01.000Z'
      }
    );

    expect(first).toEqual({
      statusCode: 200,
      body: {
        code: 0,
        providerKey: PMS_CHECKOUT_PROVIDER_KEY,
        status: 'accepted'
      }
    });
    expect(second).toEqual({
      statusCode: 404,
      body: {
        code: 404,
        message: 'pending_not_found'
      }
    });
    expect(pendingStore.get(PMS_CHECKOUT_PROVIDER_KEY, 'pending-1001')).toBeUndefined();
    expect(callbackForwarder.forwardCallback).toHaveBeenCalledTimes(1);
    expect(callbackForwarder.forwardCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        envelope: expect.objectContaining({
          source: 'adapter-feishu',
          actor: expect.objectContaining({ id: 'frontdesk-1', displayName: 'Front Desk' }),
          orchestrator: expect.objectContaining({
            toolName: 'ai_pms.pms_checkout.confirm_callback',
            pendingId: 'pending-1001',
            roomId: 'room-1001',
            dryRunIdentity: expect.objectContaining({
              idempotencyKey: 'idem-pms-checkout-1001-dry-run'
            }),
            confirmIdentity: expect.objectContaining({
              idempotencyKey: 'idem-pms-checkout-1001-confirm',
              confirmMode: 'confirm'
            }),
            callbackForwardingEnvelope: expect.objectContaining({
              auth: {
                type: 'shared-secret-header',
                headerName: 'X-AI-PMS-CALLBACK-TOKEN',
                envName: 'AI_PMS_CALLBACK_TOKEN',
                valueStoredInRepo: false
              }
            })
          })
        })
      })
    );
  });

  it('rejects provider/action mismatches without consuming or forwarding pending state', async () => {
    const replySink = {
      sendNotification: vi.fn().mockResolvedValue({
        providerKey: PMS_CHECKOUT_PROVIDER_KEY,
        deliveryId: 'delivery-pms-checkout-dry-run',
        channel: 'feishu',
        status: 'delivered'
      })
    };
    const pendingStore = createPendingStore({
      ttlMs: 10_000,
      now: () => 1_000,
      idGenerator: () => 'pending-1001'
    });
    const callbackForwarder = {
      forwardCallback: vi.fn().mockResolvedValue({ statusCode: 202, body: { code: 0 } })
    };
    const { router } = createPmsRouter(callbackForwarder);

    await dispatchProviderWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/webhook',
        rawBody: JSON.stringify(dryRunProjection())
      },
      { providerRouter: router, replySink, pendingStore }
    );
    const actionPayload = {
      ...replySink.sendNotification.mock.calls[0][0].actions[0].payload,
      actionId: 'pms.checkout.wrong-action'
    };

    const response = await dispatchCardActionRequest(
      {
        method: 'POST',
        pathname: '/providers/card-action',
        rawBody: JSON.stringify({ action: { value: actionPayload } })
      },
      { providerRouter: router, pendingStore, replySink }
    );

    expect(response).toEqual({
      statusCode: 409,
      body: {
        code: 409,
        message: 'action_mismatch'
      }
    });
    expect(pendingStore.get(PMS_CHECKOUT_PROVIDER_KEY, 'pending-1001')).toBeDefined();
    expect(callbackForwarder.forwardCallback).not.toHaveBeenCalled();
  });

  it('sends the configured shared-secret header when forwarding callbacks over HTTP', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0 }), { status: 202 }));
    const forwarder = createPmsCheckoutHttpCallbackForwarder({
      url: 'http://127.0.0.1:8792/pms/checkout/callback',
      token: 'callback-token-1',
      fetchImpl
    });

    await forwarder.forwardCallback({
      envelope: {
        source: 'adapter-feishu'
      }
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:8792/pms/checkout/callback',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'X-AI-PMS-CALLBACK-TOKEN': 'callback-token-1'
        })
      })
    );
  });

  it('returns a provider delivery failure while retaining pending lineage when Feishu delivery fails', async () => {
    const replySink = {
      sendNotification: vi.fn().mockRejectedValue(new Error('feishu delivery failed'))
    };
    const pendingStore = createPendingStore({
      ttlMs: 10_000,
      now: () => 1_000,
      idGenerator: () => 'pending-1001'
    });
    const { router } = createPmsRouter();

    const response = await dispatchProviderWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/webhook',
        rawBody: JSON.stringify(dryRunProjection())
      },
      { providerRouter: router, replySink, pendingStore }
    );

    expect(response).toEqual({
      statusCode: 502,
      body: {
        code: 502,
        providerKey: PMS_CHECKOUT_PROVIDER_KEY,
        message: 'provider_delivery_failed',
        error: 'feishu delivery failed'
      }
    });
    expect(pendingStore.get(PMS_CHECKOUT_PROVIDER_KEY, 'pending-1001')).toBeDefined();
  });
});
