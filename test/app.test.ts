import { describe, expect, it, vi } from 'vitest';
import { createAdapterApp, createFeishuChannelApp } from '../src/app.js';
import type { AdapterConfig } from '../src/config.js';
import type { ProviderDefinition } from '../src/providers/contracts.js';
import { createProviderRegistry, registerProvider } from '../src/providers/registry.js';

function createConfig(ingressMode: AdapterConfig['feishu']['ingressMode']): AdapterConfig {
  return {
    service: {
      host: '127.0.0.1',
      port: 8787,
      publicBaseUrl: 'http://localhost:8787'
    },
    feishu: {
      appId: 'app-id',
      appSecret: 'app-secret',
      ingressMode,
      verificationToken: 'token-1',
      webhookSecret: 'secret-1',
      encryptKey: undefined
    },
    providers: {
      keys: ['warning-agent'],
      defaultProvider: 'warning-agent',
      allowProviderOverride: false
    },
    state: {
      dedupeTtlSeconds: 300,
      pendingTtlSeconds: 900
    }
  };
}

function createProvider(providerKey: string): ProviderDefinition {
  return {
    providerKey,
    supportsNotification: () => false,
    async deliverNotification() {
      return {
        providerKey,
        deliveryId: `delivery-${providerKey}`,
        channel: 'feishu',
        status: 'ignored'
      };
    }
  };
}

describe('createFeishuChannelApp', () => {
  it('starts webhook ingress when configured for webhook mode', async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const app = createFeishuChannelApp(createConfig('webhook'), vi.fn().mockResolvedValue(undefined), {
      createClient: () => ({
        sendText: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
        sendCard: vi.fn().mockResolvedValue({ messageId: 'msg-2' })
      }),
      createReplySink: () => ({
        sendNotification: vi.fn().mockResolvedValue({
          providerKey: 'warning-agent',
          deliveryId: 'delivery-1',
          channel: 'feishu',
          status: 'delivered'
        })
      }),
      createWebhookServer: () => ({
        server: {} as never,
        listen,
        close
      }),
      createLongConnectionIngress: () => ({
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined)
      })
    });

    await app.start();
    await app.stop();

    expect(app.mode).toBe('webhook');
    expect(listen).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('starts long connection ingress when configured for long_connection mode', async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const stop = vi.fn().mockResolvedValue(undefined);
    const app = createFeishuChannelApp(
      createConfig('long_connection'),
      vi.fn().mockResolvedValue(undefined),
      {
        createClient: () => ({
          sendText: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
          sendCard: vi.fn().mockResolvedValue({ messageId: 'msg-2' })
        }),
        createReplySink: () => ({
          sendNotification: vi.fn().mockResolvedValue({
            providerKey: 'warning-agent',
            deliveryId: 'delivery-1',
            channel: 'feishu',
            status: 'delivered'
          })
        }),
        createWebhookServer: () => ({
          server: {} as never,
          listen: vi.fn().mockResolvedValue(undefined),
          close: vi.fn().mockResolvedValue(undefined)
        }),
        createLongConnectionIngress: () => ({
          start,
          stop
        })
      }
    );

    await app.start();
    await app.stop();

    expect(app.mode).toBe('long_connection');
    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe('createAdapterApp', () => {
  it('routes normalized inbound turns through the provider router before invoking the app seam handler', async () => {
    const registry = createProviderRegistry({
      allowedProviderKeys: ['warning-agent', 'ops-bot'],
      defaultProviderKey: 'warning-agent'
    });
    registerProvider(registry, createProvider('warning-agent'));
    registerProvider(registry, createProvider('ops-bot'));

    const listen = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const handleResolvedTurn = vi.fn().mockResolvedValue(undefined);
    let capturedTurnHandler:
      | ((...args: Parameters<typeof handleResolvedTurn>) => Promise<void>)
      | undefined;

    const app = createAdapterApp(createConfig('webhook'), registry, handleResolvedTurn, {
      createClient: () => ({
        sendText: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
        sendCard: vi.fn().mockResolvedValue({ messageId: 'msg-2' })
      }),
      createReplySink: () => ({
        sendNotification: vi.fn().mockResolvedValue({
          providerKey: 'warning-agent',
          deliveryId: 'delivery-1',
          channel: 'feishu',
          status: 'delivered'
        })
      }),
      createWebhookServer: (_config, handleTurn) => {
        capturedTurnHandler = handleTurn as typeof capturedTurnHandler;
        return {
          server: {} as never,
          listen,
          close
        };
      },
      createLongConnectionIngress: () => ({
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined)
      })
    });

    expect(app.providerRegistry).toBe(registry);
    expect(app.providerRouter.defaultProviderKey).toBe('warning-agent');

    if (!capturedTurnHandler) {
      throw new Error('expected app seam to capture the channel turn handler');
    }

    await capturedTurnHandler(
      {
        turnId: 'turn-ops-1',
        channel: 'feishu',
        intent: 'command',
        receivedAt: '2026-04-20T00:00:00.000Z',
        providerKey: 'ops-bot',
        target: {
          channel: 'feishu',
          chatId: 'oc-chat-1'
        },
        rawEvent: {
          type: 'message'
        }
      },
      {
        source: 'webhook',
        rawEvent: {
          header: { event_type: 'im.message.receive_v1' }
        }
      }
    );

    expect(handleResolvedTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        turn: expect.objectContaining({ turnId: 'turn-ops-1' }),
        resolution: expect.objectContaining({
          providerKey: 'warning-agent',
          resolutionSource: 'default'
        })
      }),
      expect.objectContaining({ source: 'webhook' })
    );
  });
});
