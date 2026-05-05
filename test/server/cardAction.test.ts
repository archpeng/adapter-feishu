import { describe, expect, it, vi } from 'vitest';
import type { JsonRecord, ProviderAlertSubmission } from '../../src/core/contracts.js';
import type { ProviderDefinition } from '../../src/providers/contracts.js';
import { createProviderRegistry, registerProvider } from '../../src/providers/registry.js';
import { createProviderRouter } from '../../src/providers/router.js';
import { createPendingStore } from '../../src/state/pendingStore.js';
import { dispatchCardActionRequest } from '../../src/server/cardAction.js';
import {
  AI_CONVERSATION_RESERVATION_CARD_ACTION_ID,
  AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY,
  PMS_PENDING_ACTION_CONFIRM_OPERATION,
} from '../../src/conversation/reservationCardDelivery.js';

function createCallbackProvider(handleCallback: ReturnType<typeof vi.fn>): ProviderDefinition<JsonRecord, ProviderAlertSubmission> {
  return {
    providerKey: 'warning-agent',
    supportsNotification: () => false,
    async deliverNotification() {
      return {
        providerKey: 'warning-agent',
        deliveryId: 'delivery-warning-agent',
        channel: 'feishu',
        status: 'ignored'
      };
    },
    async handleCallback(payload, context) {
      return handleCallback(payload, context);
    }
  };
}

describe('dispatchCardActionRequest', () => {
  it('forwards ai-conversation reservation card clicks only through adapter pending-action callback forwarding', async () => {
    const registry = createProviderRegistry();
    const router = createProviderRouter(registry);
    const pendingStore = createPendingStore({
      ttlMs: 1_000,
      now: () => 1_000,
      idGenerator: () => 'pending-unused'
    });
    pendingStore.put({
      providerKey: AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY,
      pendingId: 'reservation-card-1',
      actionId: AI_CONVERSATION_RESERVATION_CARD_ACTION_ID,
      payload: {
        pendingKind: 'ai-conversation-reservation-confirmation-card.v1',
        correlationId: 'corr-reservation-card-1',
        pendingAction: {
          pendingActionRef: 'pending-reservation-raw-1',
          cardPayloadRef: 'card-reservation-raw-1',
          quoteRef: 'quote-reservation-raw-1',
          propertyId: 'default'
        }
      },
      target: { channel: 'feishu', chatId: 'oc-reservation-1' }
    });
    const forwardCallback = vi.fn().mockResolvedValue({ statusCode: 200, body: { ok: true, status: 'ok' } });

    const response = await dispatchCardActionRequest(
      {
        method: 'POST',
        pathname: '/providers/card-action',
        rawBody: JSON.stringify({
          action: {
            value: {
              providerKey: AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY,
              pendingId: 'reservation-card-1',
              actionId: AI_CONVERSATION_RESERVATION_CARD_ACTION_ID,
              operation: PMS_PENDING_ACTION_CONFIRM_OPERATION,
              correlationId: 'corr-reservation-card-1'
            }
          },
          open_id: 'ou-frontdesk-1',
          open_chat_id: 'oc-reservation-1'
        })
      },
      {
        providerRouter: router,
        pendingStore,
        replySink: {
          sendNotification: vi.fn().mockResolvedValue({
            providerKey: AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY,
            deliveryId: 'delivery-1',
            channel: 'feishu',
            status: 'delivered'
          })
        },
        callbackForwarder: { forwardCallback },
        now: () => '2026-05-05T00:00:00.000Z'
      }
    );

    expect(response).toEqual({
      statusCode: 200,
      body: {
        code: 0,
        providerKey: AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY,
        status: 'accepted'
      }
    });
    expect(forwardCallback).toHaveBeenCalledWith(expect.objectContaining({
      envelope: expect.objectContaining({
        source: 'adapter-feishu',
        platformPendingAction: expect.objectContaining({
          operation: PMS_PENDING_ACTION_CONFIRM_OPERATION,
          request: expect.objectContaining({
            operation: PMS_PENDING_ACTION_CONFIRM_OPERATION,
            pendingActionRef: 'pending-reservation-raw-1',
            cardPayloadRef: 'card-reservation-raw-1',
            correlationId: 'corr-reservation-card-1',
            scope: expect.objectContaining({ propertyId: 'default', channel: 'typed_card' })
          })
        }),
        orchestrator: expect.objectContaining({
          callbackOwner: 'adapter-feishu',
          targetOwner: 'pms-platform',
          naturalLanguageConfirmAllowed: false
        })
      }),
      metadata: expect.objectContaining({
        providerKey: AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY,
        operation: PMS_PENDING_ACTION_CONFIRM_OPERATION,
        rawRefsLogged: false
      })
    }));
    expect(pendingStore.get(AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY, 'reservation-card-1')).toBeUndefined();
  });

  it('consumes provider-scoped pending state and forwards a callback turn to the resolved provider', async () => {
    const handleCallback = vi.fn().mockResolvedValue({
      providerKey: 'warning-agent',
      status: 'accepted',
      message: 'callback acknowledged'
    });
    const registry = createProviderRegistry({
      allowedProviderKeys: ['warning-agent'],
      defaultProviderKey: 'warning-agent'
    });
    registerProvider(registry, createCallbackProvider(handleCallback));
    const router = createProviderRouter(registry);
    const pendingStore = createPendingStore({
      ttlMs: 1_000,
      now: () => 1_000,
      idGenerator: () => 'pending-1'
    });
    pendingStore.put({
      providerKey: 'warning-agent',
      actionId: 'approve',
      payload: {
        reportId: 'report-9'
      },
      target: {
        channel: 'feishu',
        chatId: 'oc-chat-1'
      }
    });

    const response = await dispatchCardActionRequest(
      {
        method: 'POST',
        pathname: '/providers/card-action',
        rawBody: JSON.stringify({
          action: {
            value: {
              actionId: 'approve',
              pendingId: 'pending-1',
              providerKey: 'warning-agent'
            }
          },
          open_message_id: 'om_123'
        })
      },
      {
        providerRouter: router,
        pendingStore,
        replySink: {
          sendNotification: vi.fn().mockResolvedValue({
            providerKey: 'warning-agent',
            deliveryId: 'delivery-1',
            channel: 'feishu',
            status: 'delivered'
          })
        },
        now: () => '2026-04-20T00:00:00.000Z'
      }
    );

    expect(response).toEqual({
      statusCode: 200,
      body: {
        code: 0,
        providerKey: 'warning-agent',
        status: 'accepted'
      }
    });
    expect(handleCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKey: 'warning-agent',
        intent: 'callback',
        callback: {
          actionId: 'approve',
          value: {
            actionId: 'approve',
            pendingId: 'pending-1',
            providerKey: 'warning-agent'
          }
        },
        target: {
          channel: 'feishu',
          chatId: 'oc-chat-1'
        }
      }),
      expect.objectContaining({
        now: expect.any(Function)
      })
    );
    expect(pendingStore.get('warning-agent', 'pending-1')).toBeUndefined();
  });

  it('trusts long-connection card-action events without requiring the HTTP verification token', async () => {
    const handleCallback = vi.fn().mockResolvedValue({
      providerKey: 'warning-agent',
      status: 'accepted',
      message: 'callback acknowledged'
    });
    const registry = createProviderRegistry({
      allowedProviderKeys: ['warning-agent'],
      defaultProviderKey: 'warning-agent'
    });
    registerProvider(registry, createCallbackProvider(handleCallback));
    const router = createProviderRouter(registry);
    const pendingStore = createPendingStore({
      ttlMs: 1_000,
      now: () => 1_000,
      idGenerator: () => 'pending-1'
    });
    pendingStore.put({
      providerKey: 'warning-agent',
      actionId: 'approve',
      payload: { reportId: 'report-9' }
    });

    const response = await dispatchCardActionRequest(
      {
        method: 'POST',
        pathname: '/webhook/card',
        trustedSource: 'long_connection',
        rawBody: JSON.stringify({
          action: {
            value: {
              actionId: 'approve',
              pendingId: 'pending-1',
              providerKey: 'warning-agent'
            }
          }
        })
      },
      {
        providerRouter: router,
        pendingStore,
        replySink: {
          sendNotification: vi.fn().mockResolvedValue({
            providerKey: 'warning-agent',
            deliveryId: 'delivery-1',
            channel: 'feishu',
            status: 'delivered'
          })
        },
        verificationToken: 'http-token-required',
        now: () => '2026-04-20T00:00:00.000Z'
      }
    );

    expect(response.statusCode).toBe(200);
    expect(handleCallback).toHaveBeenCalledOnce();
  });

  it('accepts the Feishu SDK card-action request shape on the real card webhook path', async () => {
    const handleCallback = vi.fn().mockResolvedValue({
      providerKey: 'warning-agent',
      status: 'accepted',
      message: 'callback acknowledged'
    });
    const registry = createProviderRegistry({
      allowedProviderKeys: ['warning-agent'],
      defaultProviderKey: 'warning-agent'
    });
    registerProvider(registry, createCallbackProvider(handleCallback));
    const router = createProviderRouter(registry);
    const pendingStore = createPendingStore({
      ttlMs: 1_000,
      now: () => 1_000,
      idGenerator: () => 'pending-1'
    });
    pendingStore.put({
      providerKey: 'warning-agent',
      actionId: 'approve',
      payload: { reportId: 'report-9' }
    });

    const response = await dispatchCardActionRequest(
      {
        method: 'POST',
        pathname: '/webhook/card',
        rawBody: JSON.stringify({
          open_id: 'ou-frontdesk-1',
          user_id: 'frontdesk-1',
          tenant_key: 'tenant-1',
          open_message_id: 'om_123',
          open_chat_id: 'oc-chat-1',
          token: 'feishu-token-1',
          action: {
            tag: 'button',
            value: JSON.stringify({
              actionId: 'approve',
              pendingId: 'pending-1',
              providerKey: 'warning-agent'
            })
          }
        })
      },
      {
        providerRouter: router,
        pendingStore,
        replySink: {
          sendNotification: vi.fn().mockResolvedValue({
            providerKey: 'warning-agent',
            deliveryId: 'delivery-1',
            channel: 'feishu',
            status: 'delivered'
          })
        },
        verificationToken: 'feishu-token-1',
        now: () => '2026-04-20T00:00:00.000Z'
      }
    );

    expect(response.statusCode).toBe(200);
    expect(handleCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: {
          openId: 'ou-frontdesk-1',
          userId: 'frontdesk-1',
          tenantKey: 'tenant-1',
          displayName: undefined
        },
        target: {
          channel: 'feishu',
          chatId: 'oc-chat-1',
          messageId: 'om_123'
        },
        metadata: {
          openMessageId: 'om_123',
          pendingId: 'pending-1'
        }
      }),
      expect.anything()
    );
  });
});
