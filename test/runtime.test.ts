import { describe, expect, it, vi } from 'vitest';
import { createAdapterRuntime } from '../src/runtime.js';
import type { AdapterConfig } from '../src/config.js';
import type { AdapterHttpRequest, AdapterHttpResponse } from '../src/server/httpHost.js';

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
      allowProviderOverride: false,
      webhookAuthToken: undefined
    },
    form: {
      webhookAuthToken: 'form-token-1',
      allowTargetOverride: false,
      userIdType: 'user_id',
      defaultTarget: {
        appToken: 'app_token_default',
        tableId: 'tbl_default',
        formId: 'form_default'
      }
    },
    state: {
      dedupeTtlSeconds: 300,
      pendingTtlSeconds: 900
    }
  };
}

function createFeishuClientStub() {
  return {
    sendText: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
    sendCard: vi.fn().mockResolvedValue({ messageId: 'msg-2' })
  };
}

function createBitableClientStub(createRecord = vi.fn().mockResolvedValue({ recordId: 'rec-1' })) {
  return {
    createRecord,
    getForm: vi.fn(),
    listFormFields: vi.fn()
  };
}

describe('createAdapterRuntime', () => {
  it('starts the standalone HTTP host in webhook mode', async () => {
    const listen = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const longConnectionStart = vi.fn().mockResolvedValue(undefined);
    const longConnectionStop = vi.fn().mockResolvedValue(undefined);

    const runtime = createAdapterRuntime(createConfig('webhook'), {
      createClient: () => createFeishuClientStub(),
      createBitableClient: () => createBitableClientStub(),
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
      createClient: () => createFeishuClientStub(),
      createBitableClient: () => createBitableClientStub(),
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

  it('routes /providers/form-webhook through the runtime with the configured form contract', async () => {
    const createRecord = vi.fn().mockResolvedValue({
      recordId: 'rec_1',
      fields: { Title: 'adapter-feishu' }
    });
    let handleRequest: ((request: AdapterHttpRequest) => Promise<AdapterHttpResponse>) | undefined;

    createAdapterRuntime(createConfig('webhook'), {
      createClient: () => createFeishuClientStub(),
      createBitableClient: () => createBitableClientStub(createRecord),
      createReplySink: () => ({
        sendNotification: vi.fn().mockResolvedValue({
          providerKey: 'warning-agent',
          deliveryId: 'delivery-1',
          channel: 'feishu',
          status: 'delivered'
        })
      }),
      createHttpServer: (_config, nextHandleRequest) => {
        handleRequest = nextHandleRequest;
        return {
          listen: vi.fn().mockResolvedValue(undefined),
          close: vi.fn().mockResolvedValue(undefined)
        };
      },
      createLongConnectionIngress: () => ({
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined)
      })
    });

    const response = await handleRequest?.({
      method: 'POST',
      pathname: '/providers/form-webhook',
      headers: {
        authorization: 'Bearer form-token-1'
      },
      rawBody: JSON.stringify({
        clientToken: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        fields: { Title: 'adapter-feishu' }
      })
    });

    expect(createRecord).toHaveBeenCalledWith({
      appToken: 'app_token_default',
      tableId: 'tbl_default',
      clientToken: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      userIdType: 'user_id',
      fields: { Title: 'adapter-feishu' }
    });
    expect(response).toEqual({
      statusCode: 200,
      body: {
        code: 0,
        status: 'record_created',
        recordId: 'rec_1',
        clientToken: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        targetSource: 'default',
        target: {
          appToken: 'app_token_default',
          tableId: 'tbl_default',
          formId: 'form_default'
        }
      }
    });
  });
});
