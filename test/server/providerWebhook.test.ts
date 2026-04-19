import { describe, expect, it, vi } from 'vitest';
import { createWarningAgentProvider } from '../../src/providers/warning-agent/index.js';
import { createProviderRegistry, registerProvider } from '../../src/providers/registry.js';
import { createProviderRouter } from '../../src/providers/router.js';
import { createAlertDeduper } from '../../src/state/dedupe.js';
import { dispatchProviderWebhookRequest } from '../../src/server/providerWebhook.js';

describe('dispatchProviderWebhookRequest', () => {
  it('routes a provider notification and suppresses duplicates through the dedupe window', async () => {
    const replySink = {
      sendNotification: vi.fn().mockResolvedValue({
        providerKey: 'warning-agent',
        deliveryId: 'delivery-1',
        channel: 'feishu',
        status: 'delivered'
      })
    };
    const registry = createProviderRegistry({
      allowedProviderKeys: ['warning-agent'],
      defaultProviderKey: 'warning-agent'
    });
    registerProvider(
      registry,
      createWarningAgentProvider({
        defaultTarget: {
          channel: 'feishu',
          chatId: 'oc-chat-1'
        },
        now: () => '2026-04-20T00:00:00.000Z'
      })
    );
    const router = createProviderRouter(registry);
    const deduper = createAlertDeduper({ ttlMs: 1_000, now: () => 1_000 });

    const request = {
      method: 'POST',
      pathname: '/providers/webhook',
      rawBody: JSON.stringify({
        reportId: 'report-9',
        runId: 'wr_123',
        summary: 'cpu anomaly investigated'
      })
    };

    const first = await dispatchProviderWebhookRequest(request, {
      providerRouter: router,
      replySink,
      deduper,
      dedupeKeyFromPayload(payload) {
        return typeof payload.reportId === 'string' ? payload.reportId : undefined;
      },
      defaultTarget: {
        channel: 'feishu',
        chatId: 'oc-chat-1'
      },
      now: () => '2026-04-20T00:00:00.000Z'
    });
    const second = await dispatchProviderWebhookRequest(request, {
      providerRouter: router,
      replySink,
      deduper,
      dedupeKeyFromPayload(payload) {
        return typeof payload.reportId === 'string' ? payload.reportId : undefined;
      },
      defaultTarget: {
        channel: 'feishu',
        chatId: 'oc-chat-1'
      },
      now: () => '2026-04-20T00:00:00.000Z'
    });

    expect(first).toEqual({
      statusCode: 202,
      body: {
        code: 0,
        providerKey: 'warning-agent',
        status: 'delivered'
      }
    });
    expect(second).toEqual({
      statusCode: 202,
      body: {
        code: 0,
        providerKey: 'warning-agent',
        status: 'duplicate_ignored'
      }
    });
    expect(replySink.sendNotification).toHaveBeenCalledTimes(1);
  });
});
