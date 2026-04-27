import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createAdapterRuntime, type AdapterRuntimeDeps } from '../src/runtime.js';
import type { AdapterConfig } from '../src/config.js';
import type { AdapterHttpRequest, AdapterHttpResponse } from '../src/server/httpHost.js';

function createConfig(
  ingressMode: AdapterConfig['feishu']['ingressMode'],
  registryPath?: string
): AdapterConfig {
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
      },
      registryPath
    },
    state: {
      dedupeTtlSeconds: 300,
      pendingTtlSeconds: 900
    },
    pmsCheckout: {
      callbackUrl: undefined,
      inboundTurnUrl: undefined,
      callbackToken: undefined,
      callbackTokenHeader: 'X-AI-PMS-CALLBACK-TOKEN',
      callbackTokenEnvName: 'AI_PMS_CALLBACK_TOKEN',
      callbackTimeoutMs: 5000,
      inboundTurnTimeoutMs: 5000,
      allowedChatIds: [],
      allowedOpenIds: [],
      allowedUserIds: [],
      allowedUnionIds: []
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
    listFormFields: vi.fn(),
    listTableFields: vi.fn()
  };
}

function createRuntimeDeps(): AdapterRuntimeDeps {
  return {
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
      listen: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined)
    }),
    createLongConnectionIngress: () => ({
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined)
    })
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

  it('keeps registry unset in legacy-only startup mode when no registry path is configured', () => {
    const runtime = createAdapterRuntime(createConfig('webhook'), createRuntimeDeps());

    expect(runtime.formRegistry).toBeUndefined();
  });

  it('loads the example managed form registry during runtime creation', () => {
    const registryPath = fileURLToPath(new URL('../config/form-bindings.example.json', import.meta.url));

    const runtime = createAdapterRuntime(createConfig('webhook', registryPath), createRuntimeDeps());

    expect(runtime.formRegistry).toEqual({
      version: 1,
      forms: {
        'pms-intake': {
          formKey: 'pms-intake',
          enabled: true,
          target: {
            appToken: 'bascn_example_app_token',
            tableId: 'tbl_example_table_id',
            formId: 'form_example_form_id'
          },
          fieldMap: {
            title: 'Title',
            severity: 'Severity',
            description: 'Description'
          },
          fixedFields: {
            Source: 'adapter-feishu-managed-form',
            Ingress: 'formKey:pms-intake'
          },
          policy: {
            validateFormSchemaByDefault: true,
            rejectUnmappedFields: true
          }
        }
      }
    });
  });

  it('fails fast when configured managed form registry cannot be loaded or parsed', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'adapter-feishu-registry-'));
    const missingPath = join(tmp, 'missing.json');
    const invalidJsonPath = join(tmp, 'invalid-json.json');
    const invalidBindingPath = join(tmp, 'invalid-binding.json');

    try {
      writeFileSync(invalidJsonPath, '{not-json', 'utf8');
      writeFileSync(
        invalidBindingPath,
        JSON.stringify({ version: 1, forms: { broken: { enabled: true } } }),
        'utf8'
      );

      expect(() => createAdapterRuntime(createConfig('webhook', missingPath), createRuntimeDeps())).toThrow(
        /Failed to load ADAPTER_FEISHU_FORM_REGISTRY_PATH/
      );
      expect(() => createAdapterRuntime(createConfig('webhook', invalidJsonPath), createRuntimeDeps())).toThrow(
        /Invalid ADAPTER_FEISHU_FORM_REGISTRY_PATH JSON/
      );
      expect(() => createAdapterRuntime(createConfig('webhook', invalidBindingPath), createRuntimeDeps())).toThrow(
        /Managed form registry invalid/
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
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

  it('forwards pms-checkout command turns to the configured ai-pms inbound endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, status: 'dry_run_projected' }), { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    let handleTurn: Parameters<AdapterRuntimeDeps['createLongConnectionIngress']>[1] | undefined;
    const config = createConfig('long_connection');
    config.providers = {
      keys: ['pms-checkout'],
      defaultProvider: 'pms-checkout',
      allowProviderOverride: false,
      webhookAuthToken: undefined
    };
    config.pmsCheckout = {
      callbackUrl: undefined,
      inboundTurnUrl: 'http://127.0.0.1:8792/pms/checkout/feishu-message',
      callbackToken: 'callback-token-1',
      callbackTokenHeader: 'X-AI-PMS-CALLBACK-TOKEN',
      callbackTokenEnvName: 'AI_PMS_CALLBACK_TOKEN',
      callbackTimeoutMs: 5000,
      inboundTurnTimeoutMs: 5000,
      allowedChatIds: ['oc_test'],
      allowedOpenIds: [],
      allowedUserIds: [],
      allowedUnionIds: []
    };

    try {
      createAdapterRuntime(config, {
        createClient: () => createFeishuClientStub(),
        createBitableClient: () => createBitableClientStub(),
        createReplySink: () => ({
          sendNotification: vi.fn().mockResolvedValue({
            providerKey: 'pms-checkout',
            deliveryId: 'delivery-1',
            channel: 'feishu',
            status: 'delivered'
          })
        }),
        createHttpServer: () => ({
          listen: vi.fn().mockResolvedValue(undefined),
          close: vi.fn().mockResolvedValue(undefined)
        }),
        createLongConnectionIngress: (_config, nextHandleTurn) => {
          handleTurn = nextHandleTurn;
          return {
            start: vi.fn().mockResolvedValue(undefined),
            stop: vi.fn().mockResolvedValue(undefined)
          };
        }
      });

      await handleTurn?.({
        turnId: 'msg-1',
        channel: 'feishu',
        intent: 'command',
        receivedAt: '2026-04-27T00:00:00.000Z',
        actor: { openId: 'ou_test' },
        target: { channel: 'feishu', chatId: 'oc_test', messageId: 'msg-1' },
        text: 'room 1001 checkout',
        rawEvent: {},
        metadata: { eventType: 'im.message.receive_v1' }
      }, {
        source: 'long_connection',
        rawEvent: {}
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://127.0.0.1:8792/pms/checkout/feishu-message');
      expect(init?.headers).toMatchObject({
        'content-type': 'application/json',
        'X-AI-PMS-CALLBACK-TOKEN': 'callback-token-1'
      });
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        name: 'adapter-feishu-inbound-turn',
        version: 'v1',
        source: 'adapter-feishu',
        providerKey: 'pms-checkout'
      });
      expect(body.turn.text).toBe('room 1001 checkout');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not forward pms-checkout command turns from unauthorized chat or actor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    let handleTurn: Parameters<AdapterRuntimeDeps['createLongConnectionIngress']>[1] | undefined;
    const config = createConfig('long_connection');
    config.providers = {
      keys: ['pms-checkout'],
      defaultProvider: 'pms-checkout',
      allowProviderOverride: false,
      webhookAuthToken: undefined
    };
    config.pmsCheckout = {
      callbackUrl: undefined,
      inboundTurnUrl: 'http://127.0.0.1:8792/pms/checkout/feishu-message',
      callbackToken: 'callback-token-1',
      callbackTokenHeader: 'X-AI-PMS-CALLBACK-TOKEN',
      callbackTokenEnvName: 'AI_PMS_CALLBACK_TOKEN',
      callbackTimeoutMs: 5000,
      inboundTurnTimeoutMs: 5000,
      allowedChatIds: ['oc_allowed'],
      allowedOpenIds: ['ou_allowed'],
      allowedUserIds: [],
      allowedUnionIds: []
    };

    try {
      createAdapterRuntime(config, {
        createClient: () => createFeishuClientStub(),
        createBitableClient: () => createBitableClientStub(),
        createReplySink: () => ({
          sendNotification: vi.fn().mockResolvedValue({
            providerKey: 'pms-checkout',
            deliveryId: 'delivery-1',
            channel: 'feishu',
            status: 'delivered'
          })
        }),
        createHttpServer: () => ({
          listen: vi.fn().mockResolvedValue(undefined),
          close: vi.fn().mockResolvedValue(undefined)
        }),
        createLongConnectionIngress: (_config, nextHandleTurn) => {
          handleTurn = nextHandleTurn;
          return {
            start: vi.fn().mockResolvedValue(undefined),
            stop: vi.fn().mockResolvedValue(undefined)
          };
        }
      });

      await handleTurn?.({
        turnId: 'msg-denied-chat',
        channel: 'feishu',
        intent: 'command',
        receivedAt: '2026-04-27T00:00:00.000Z',
        actor: { openId: 'ou_allowed' },
        target: { channel: 'feishu', chatId: 'oc_denied', messageId: 'msg-denied-chat' },
        text: 'room 1001 checkout',
        rawEvent: {},
        metadata: { eventType: 'im.message.receive_v1' }
      }, {
        source: 'long_connection',
        rawEvent: {}
      });

      await handleTurn?.({
        turnId: 'msg-denied-actor',
        channel: 'feishu',
        intent: 'command',
        receivedAt: '2026-04-27T00:00:01.000Z',
        actor: { openId: 'ou_denied' },
        target: { channel: 'feishu', chatId: 'oc_allowed', messageId: 'msg-denied-actor' },
        text: 'room 1001 checkout',
        rawEvent: {},
        metadata: { eventType: 'im.message.receive_v1' }
      }, {
        source: 'long_connection',
        rawEvent: {}
      });

      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('wires long-connection card actions through the shared card-action dispatcher', async () => {
    let handleCardAction: AdapterRuntimeDeps['createLongConnectionIngress'] extends (
      config: never,
      handleTurn: never,
      deps: never,
      options?: infer Options
    ) => never
      ? NonNullable<Options>['handleCardAction']
      : never;

    createAdapterRuntime(createConfig('long_connection'), {
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
        listen: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined)
      }),
      createLongConnectionIngress: (_config, _handleTurn, _deps, options) => {
        handleCardAction = options?.handleCardAction;
        return {
          start: vi.fn().mockResolvedValue(undefined),
          stop: vi.fn().mockResolvedValue(undefined)
        };
      }
    });

    const response = await handleCardAction?.({
      method: 'POST',
      pathname: '/webhook/card',
      rawBody: JSON.stringify({
        header: { token: 'token-1' },
        event: { action: { value: {} } }
      })
    });

    expect(response).toEqual({
      code: 400,
      message: 'invalid_action_payload',
      blocker: 'adapter_card_action_ingress_invalid'
    });
  });

  it('registers pms-checkout at runtime and lists it on /health when enabled', async () => {
    let handleRequest: ((request: AdapterHttpRequest) => Promise<AdapterHttpResponse>) | undefined;
    const config = createConfig('webhook');
    config.providers = {
      keys: ['warning-agent', 'pms-checkout'],
      defaultProvider: 'warning-agent',
      allowProviderOverride: true,
      webhookAuthToken: undefined
    };
    config.pmsCheckout = {
      callbackUrl: 'http://127.0.0.1:8792/pms/checkout/callback',
      inboundTurnUrl: undefined,
      callbackToken: 'callback-token-1',
      callbackTokenHeader: 'X-AI-PMS-CALLBACK-TOKEN',
      callbackTokenEnvName: 'AI_PMS_CALLBACK_TOKEN',
      callbackTimeoutMs: 5000,
      inboundTurnTimeoutMs: 5000,
      allowedChatIds: [],
      allowedOpenIds: [],
      allowedUserIds: [],
      allowedUnionIds: []
    };

    createAdapterRuntime(config, {
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
      method: 'GET',
      pathname: '/health',
      headers: {},
      rawBody: ''
    });

    expect(response).toEqual({
      statusCode: 200,
      body: {
        code: 0,
        status: 'ok',
        ingressMode: 'webhook',
        providers: ['warning-agent', 'pms-checkout']
      }
    });
  });

  it('routes managed formKey requests through the runtime with the loaded registry', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'adapter-feishu-runtime-registry-'));
    const registryPath = join(tmp, 'forms.json');
    const createRecord = vi.fn().mockResolvedValue({
      recordId: 'rec_managed_runtime',
      fields: {
        Title: 'adapter-feishu',
        Source: 'managed-runtime'
      }
    });
    let handleRequest: ((request: AdapterHttpRequest) => Promise<AdapterHttpResponse>) | undefined;

    try {
      writeFileSync(
        registryPath,
        JSON.stringify({
          version: 1,
          forms: {
            'pms-intake': {
              enabled: true,
              target: {
                appToken: 'app_token_managed',
                tableId: 'tbl_managed',
                formId: 'form_managed'
              },
              fieldMap: {
                title: 'Title'
              },
              fixedFields: {
                Source: 'managed-runtime'
              },
              policy: {
                validateFormSchemaByDefault: false,
                rejectUnmappedFields: true
              }
            }
          }
        }),
        'utf8'
      );

      createAdapterRuntime(createConfig('webhook', registryPath), {
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
          formKey: 'pms-intake',
          clientToken: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          fields: { title: 'adapter-feishu' }
        })
      });

      expect(createRecord).toHaveBeenCalledWith({
        appToken: 'app_token_managed',
        tableId: 'tbl_managed',
        clientToken: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        userIdType: 'user_id',
        fields: {
          Title: 'adapter-feishu',
          Source: 'managed-runtime'
        }
      });
      expect(response?.body).toMatchObject({
        code: 0,
        status: 'record_created',
        recordId: 'rec_managed_runtime',
        targetSource: 'managed'
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
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
