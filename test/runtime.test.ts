import { describe, expect, it, vi } from 'vitest';
import { createAdapterRuntime } from '../src/runtime.js';
import type { AdapterConfig } from '../src/config.js';

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

describe('createAdapterRuntime', () => {
  it('starts the standalone HTTP host in webhook mode', async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const longConnectionStart = vi.fn().mockResolvedValue(undefined);
    const longConnectionStop = vi.fn().mockResolvedValue(undefined);

    const runtime = createAdapterRuntime(createConfig('webhook'), {
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
      createHttpServer: () => ({
        listen,
        close
      }),
      createLongConnectionIngress: () => ({
        start: longConnectionStart,
        stop: longConnectionStop
      })
    });

    await runtime.start();
    await runtime.stop();

    expect(listen).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(longConnectionStart).not.toHaveBeenCalled();
    expect(longConnectionStop).not.toHaveBeenCalled();
  });

  it('starts both the standalone HTTP host and long-connection ingress when configured', async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const longConnectionStart = vi.fn().mockResolvedValue(undefined);
    const longConnectionStop = vi.fn().mockResolvedValue(undefined);

    const runtime = createAdapterRuntime(createConfig('long_connection'), {
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
      createHttpServer: () => ({
        listen,
        close
      }),
      createLongConnectionIngress: () => ({
        start: longConnectionStart,
        stop: longConnectionStop
      })
    });

    await runtime.start();
    await runtime.stop();

    expect(listen).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(longConnectionStart).toHaveBeenCalledTimes(1);
    expect(longConnectionStop).toHaveBeenCalledTimes(1);
  });
});
