import { describe, expect, it, vi } from 'vitest';
import {
  createPmsCheckoutPlatformPendingActionCallbackForwarder,
  createPmsCheckoutProvider,
  PMS_CHECKOUT_PROVIDER_KEY,
} from '../../src/providers/pms-checkout/index.js';
import { createProviderRegistry, registerProvider } from '../../src/providers/registry.js';
import { createProviderRouter } from '../../src/providers/router.js';
import { dispatchCardActionRequest } from '../../src/server/cardAction.js';
import { dispatchProviderWebhookRequest } from '../../src/server/providerWebhook.js';
import { createPendingStore } from '../../src/state/pendingStore.js';

function dryRunProjection() {
  return {
    providerKey: PMS_CHECKOUT_PROVIDER_KEY,
    requestedAt: '2026-04-26T00:00:02.000Z',
    feishuProjection: {
      providerKey: PMS_CHECKOUT_PROVIDER_KEY,
      projectionKind: 'dryRunCard',
      canonicalSource: 'pms-platform',
      target: { kind: 'chat', id: 'oc-chat-1' },
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
          requestFingerprint: 'sha256:pms-checkout-dry-run-1001',
        },
        confirmAction: {
          actionId: 'pms.checkout.confirm',
          confirmMode: 'confirm',
          idempotencyKey: 'idem-pms-checkout-1001-confirm',
          requestFingerprint: 'sha256:pms-checkout-confirm-1001',
          callbackEnvelope: 'pms-checkout-confirm-callback-forward.v1',
          forwardTo: {
            owner: 'pms-platform',
            handler: 'pms_platform.pending_action.confirm_callback',
            auth: {
              headerName: 'Authorization',
              envName: 'PMS_PLATFORM_PENDING_ACTION_TOKEN',
              valueStoredInRepo: false,
            },
          },
          pendingAction: {
            pendingActionRef: 'pa-checkout-1001',
            cardPayloadRef: 'card-checkout-1001',
            scope: {
              propertyId: 'hotel-1',
              channel: 'typed_card',
              tenantIdHash: 'sha256:tenant-1',
              chatIdHash: 'sha256:oc-chat-1',
              userIdHash: 'sha256:frontdesk-1',
            },
          },
        },
        actor: { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' },
        correlationId: 'corr-pms-checkout-1001',
        idempotencyKey: 'idem-pms-checkout-1001-dry-run',
      },
    },
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
        eventTypes: ['RoomCheckedOut', 'HousekeepingTaskCreated'],
      },
    },
  };
}

function createRouter(callbackForwarder = { forwardCallback: vi.fn().mockResolvedValue({ statusCode: 202, body: { code: 0 } }) }) {
  const registry = createProviderRegistry({ allowedProviderKeys: [PMS_CHECKOUT_PROVIDER_KEY] });
  registerProvider(registry, createPmsCheckoutProvider({ callbackForwarder }));
  return createProviderRouter(registry, { defaultProviderKey: PMS_CHECKOUT_PROVIDER_KEY, allowProviderOverride: true });
}

function cardAction(actionPayload: unknown) {
  return {
    method: 'POST',
    rawBody: JSON.stringify({
      token: 'verification-token-1',
      action: { value: actionPayload },
      operator: { open_id: 'frontdesk-1' },
      tenant_key: 'tenant-1',
      open_chat_id: 'oc-chat-1',
    }),
  };
}

describe('pms-checkout platform-only provider', () => {
  it('renders dry-run cards, stores pending state, and emits platform callback payloads', async () => {
    const replySink = { sendNotification: vi.fn().mockResolvedValue({ ok: true }) };
    const pendingStore = createPendingStore({ ttlMs: 60_000 });
    const response = await dispatchProviderWebhookRequest(
      { method: 'POST', rawBody: JSON.stringify(dryRunProjection()) },
      { providerRouter: createRouter(), replySink, pendingStore }
    );

    expect(response).toEqual({ statusCode: 202, body: { code: 0, status: undefined, providerKey: PMS_CHECKOUT_PROVIDER_KEY } });
    const notification = replySink.sendNotification.mock.calls[0]?.[0];
    expect(notification.actions[0].payload.pendingAction.pendingActionRef).toBe('pa-checkout-1001');
    expect(pendingStore.get(PMS_CHECKOUT_PROVIDER_KEY, notification.actions[0].payload.pendingId)).toBeDefined();
  });

  it('forwards typed card confirms only to fixed pms-platform pending-action endpoints', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, status: 'confirmed' }), { status: 202 }));
    const forwarder = createPmsCheckoutPlatformPendingActionCallbackForwarder({
      baseUrl: 'http://127.0.0.1:8791',
      token: 'platform-token-1',
      fetchImpl,
    });
    const replySink = { sendNotification: vi.fn().mockResolvedValue({ ok: true }) };
    const pendingStore = createPendingStore({ ttlMs: 60_000 });
    await dispatchProviderWebhookRequest(
      { method: 'POST', rawBody: JSON.stringify(dryRunProjection()) },
      { providerRouter: createRouter(forwarder), replySink, pendingStore }
    );
    const actionPayload = replySink.sendNotification.mock.calls[0][0].actions[0].payload;

    const response = await dispatchCardActionRequest(cardAction(actionPayload), {
      providerRouter: createRouter(forwarder),
      pendingStore,
      verificationToken: 'verification-token-1',
    });

    expect(response.statusCode).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:8791/v1/pms/pending-actions/confirm',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer platform-token-1' }),
      })
    );
    const requestBody = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
    expect(requestBody.operation).toBe('pms.pending_action.confirm');
    expect(requestBody.pendingActionRef).toBe('pa-checkout-1001');
    expect(pendingStore.get(PMS_CHECKOUT_PROVIDER_KEY, actionPayload.pendingId)).toBeUndefined();
  });

  it('retains pending state when platform callback forwarding fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 503 }), { status: 503 }));
    const forwarder = createPmsCheckoutPlatformPendingActionCallbackForwarder({ baseUrl: 'http://127.0.0.1:8791', token: 'platform-token-1', fetchImpl });
    const replySink = { sendNotification: vi.fn().mockResolvedValue({ ok: true }) };
    const pendingStore = createPendingStore({ ttlMs: 60_000 });
    await dispatchProviderWebhookRequest(
      { method: 'POST', rawBody: JSON.stringify(dryRunProjection()) },
      { providerRouter: createRouter(forwarder), replySink, pendingStore }
    );
    const actionPayload = replySink.sendNotification.mock.calls[0][0].actions[0].payload;

    const response = await dispatchCardActionRequest(cardAction(actionPayload), {
      providerRouter: createRouter(forwarder),
      pendingStore,
      verificationToken: 'verification-token-1',
    });

    expect(response.statusCode).toBe(502);
    expect(pendingStore.get(PMS_CHECKOUT_PROVIDER_KEY, actionPayload.pendingId)).toBeDefined();
  });

  it('delivers result projections without creating pending state', async () => {
    const replySink = { sendNotification: vi.fn().mockResolvedValue({ ok: true }) };
    const pendingStore = createPendingStore({ ttlMs: 60_000 });
    const response = await dispatchProviderWebhookRequest(
      { method: 'POST', rawBody: JSON.stringify(resultProjection()) },
      { providerRouter: createRouter(), replySink, pendingStore }
    );

    expect(response.statusCode).toBe(202);
    expect(replySink.sendNotification.mock.calls[0][0].title).toContain('退房完成');
    expect(pendingStore.list()).toEqual([]);
  });
});
