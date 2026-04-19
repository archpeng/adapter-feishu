import { describe, expect, it, vi } from 'vitest';
import type { JsonRecord, ProviderAlertSubmission } from '../../src/core/contracts.js';
import type { ProviderDefinition } from '../../src/providers/contracts.js';
import { createProviderRegistry, registerProvider } from '../../src/providers/registry.js';
import { createProviderRouter } from '../../src/providers/router.js';
import { createPendingStore } from '../../src/state/pendingStore.js';
import { dispatchCardActionRequest } from '../../src/server/cardAction.js';

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
});
