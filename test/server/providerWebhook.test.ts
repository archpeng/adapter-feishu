import { describe, expect, it, vi } from 'vitest';
import { createWarningAgentProvider } from '../../src/providers/warning-agent/index.js';
import { createProviderRegistry, registerProvider } from '../../src/providers/registry.js';
import { createProviderRouter } from '../../src/providers/router.js';
import { createAlertDeduper } from '../../src/state/dedupe.js';
import { dispatchProviderWebhookRequest } from '../../src/server/providerWebhook.js';

describe('dispatchProviderWebhookRequest', () => {
  it('rejects provider pushes without the configured auth token', async () => {
    const registry = createProviderRegistry({
      allowedProviderKeys: ['warning-agent'],
      defaultProviderKey: 'warning-agent'
    });
    registerProvider(registry, createWarningAgentProvider());
    const router = createProviderRouter(registry);

    const response = await dispatchProviderWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/webhook',
        rawBody: JSON.stringify({
          reportId: 'report-9',
          runId: 'wr_123',
          summary: 'cpu anomaly investigated'
        })
      },
      {
        providerRouter: router,
        replySink: {
          sendNotification: vi.fn()
        },
        authToken: 'provider-token-1'
      }
    );

    expect(response).toEqual({
      statusCode: 401,
      body: {
        code: 401,
        message: 'unauthorized'
      }
    });
  });

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
      headers: {
        authorization: 'Bearer provider-token-1'
      },
      rawBody: JSON.stringify({
        reportId: 'report-9',
        runId: 'wr_123',
        summary: 'cpu anomaly investigated'
      })
    };

    const first = await dispatchProviderWebhookRequest(request, {
      providerRouter: router,
      replySink,
      authToken: 'provider-token-1',
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
      authToken: 'provider-token-1',
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

  it('returns 502 when downstream delivery fails instead of throwing out of the request path', async () => {
    const replySink = {
      sendNotification: vi.fn().mockRejectedValue(new Error('feishu delivery failed'))
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
        }
      })
    );
    const router = createProviderRouter(registry);

    const response = await dispatchProviderWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/webhook',
        rawBody: JSON.stringify({
          reportId: 'report-10',
          runId: 'wr_124',
          summary: 'cpu anomaly investigated'
        })
      },
      {
        providerRouter: router,
        replySink
      }
    );

    expect(response).toEqual({
      statusCode: 502,
      body: {
        code: 502,
        providerKey: 'warning-agent',
        message: 'provider_delivery_failed',
        error: 'feishu delivery failed'
      }
    });
  });
});
