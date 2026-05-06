import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createAdapterRuntime, type AdapterRuntimeDeps } from '../src/runtime.js';
import type { AdapterConfig } from '../src/config.js';
import {
  AI_CONVERSATION_RESERVATION_CARD_ACTION_ID,
  AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY,
  conversationReservationCardReplies,
} from '../src/conversation/reservationCardDelivery.js';
import type { JsonRecord } from '../src/core/contracts.js';
import type { AdapterHttpRequest, AdapterHttpResponse } from '../src/server/httpHost.js';

function reservationCardReply(overrides: JsonRecord = {}): JsonRecord {
  return {
    type: 'reservation_confirmation_card',
    text: '预订确认卡片已准备好；这还不是最终预订，真正确认仍需点击飞书卡片按钮。',
    contract: 'ai-conversation.reservation-confirmation-card.v1',
    operation: 'pms.reservation.prepare_confirm',
    card: {
      title: '预订确认',
      summary: 'PMS 已生成待确认的预订草稿；请人工核对后点击卡片按钮。',
      bodyMarkdown: '**这不是最终预订确认。**\n点击卡片按钮后才会转交 PMS pending-action 确认。',
      facts: [{ label: '入住日期', value: '2026-05-07' }]
    },
    pendingAction: {
      pendingActionRef: 'pending-reservation-raw-runtime',
      cardPayloadRef: 'card-reservation-raw-runtime',
      quoteRef: 'quote-reservation-raw-runtime',
      propertyId: 'default',
      status: 'awaitingConfirmation',
      confirmationMode: 'typedCardOnly',
      mutationStatus: 'none'
    },
    callback: {
      owner: 'adapter-feishu',
      targetOwner: 'pms-platform',
      confirmOperation: 'pms.pending_action.confirm',
      cancelOperation: 'pms.pending_action.cancel',
      correlationId: 'corr-reservation-runtime',
      naturalLanguageConfirmAllowed: false
    },
    safety: {
      customerTextContainsRawRefs: false,
      durableAiConversationMemoryAllowed: false,
      rawRefsConfinedToAdapterCallbackBoundary: true
    },
    ownerBoundaries: {
      cardPayload: 'pms-platform produces cardPayloadRef; adapter-feishu renders Feishu card from this delivery envelope.',
      pendingAction: 'pms-platform owns pendingActionRef, expiry, idempotency, and pending-action state.',
      callback: 'adapter-feishu owns card click ingress and forwards only fixed pending-action callbacks to pms-platform.'
    },
    ...overrides
  };
}

function createConfig(
  ingressMode: AdapterConfig['feishu']['ingressMode'],
  registryPath?: string,
  pmsBaseRegistryPath?: string
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
    pmsBase: {
      webhookAuthToken: undefined,
      registryPath: pmsBaseRegistryPath
    },
    state: {
      dedupeTtlSeconds: 300,
      pendingTtlSeconds: 900
    },
    pmsCheckout: {
      callbackTimeoutMs: 5000,
      pendingActionCallbackMode: 'platform',
      pendingActionBaseUrl: 'http://127.0.0.1:8791/',
      pendingActionToken: 'platform-token-1',
      pendingActionTokenEnvName: 'PMS_PLATFORM_PENDING_ACTION_TOKEN',
      pendingActionTimeoutMs: 5000,
      allowedChatIds: [],
      allowedOpenIds: [],
      allowedUserIds: [],
      allowedUnionIds: []
    },
    conversation: {
      turnUrl: undefined,
      inboundAuthToken: undefined,
      inboundAuthHeader: 'X-AI-CONVERSATION-TOKEN',
      inboundAuthEnvName: 'AI_CONVERSATION_INBOUND_AUTH_TOKEN',
      turnTimeoutMs: 5000,
      allowedChatIds: [],
      allowedOpenIds: [],
      allowedUserIds: [],
      allowedUnionIds: []
    },
    pmsAgent: {
      turnUrl: undefined,
      authToken: undefined,
      authHeader: 'X-PMS-AGENT-TOKEN',
      authEnvName: 'PMS_AGENT_AUTH_TOKEN',
      turnUrlEnvName: 'PMS_AGENT_TURN_URL',
      turnTimeoutMs: 5000,
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
    getRecord: vi.fn(),
    listRecords: vi.fn(),
    updateRecord: vi.fn(),
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

  it('keeps registry unset in default-target startup mode when no registry path is configured', () => {
    const runtime = createAdapterRuntime(createConfig('webhook'), createRuntimeDeps());

    expect(runtime.formRegistry).toBeUndefined();
    expect(runtime.pmsBaseProjectionRegistry).toBeUndefined();
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
          delivery: {
            kind: 'base_record'
          },
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

  it('loads the example PMS Base projection registry during runtime creation', () => {
    const pmsBaseRegistryPath = fileURLToPath(new URL('../config/pms-base-projections.example.json', import.meta.url));

    const runtime = createAdapterRuntime(createConfig('webhook', undefined, pmsBaseRegistryPath), createRuntimeDeps());

    expect(runtime.pmsBaseProjectionRegistry?.bindings.roomLedger.fieldMap.roomNumber).toBe('房号');
    expect(runtime.pmsBaseProjectionRegistry?.bindings.operationRequests.updateAllowedFields).toContain('resultJSON');
    expect(runtime.pmsBaseProjectionRegistry?.bindings.inventoryCalendar.fieldMap.intervalKey).toBe('库存区间键');
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

  it('does not route pms-checkout commands through a direct PMS provider path', async () => {
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
      callbackTimeoutMs: 5000,
      pendingActionCallbackMode: 'platform',
      pendingActionBaseUrl: 'http://127.0.0.1:8791/',
      pendingActionToken: 'platform-token-1',
      pendingActionTokenEnvName: 'PMS_PLATFORM_PENDING_ACTION_TOKEN',
      pendingActionTimeoutMs: 5000,
      allowedChatIds: ['fixture-chat-alpha'],
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
        actor: { openId: 'fixture-user-alpha' },
        target: { channel: 'feishu', chatId: 'fixture-chat-alpha', messageId: 'msg-1' },
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
      callbackTimeoutMs: 5000,
      pendingActionCallbackMode: 'platform',
      pendingActionBaseUrl: 'http://127.0.0.1:8791/',
      pendingActionToken: 'platform-token-1',
      pendingActionTokenEnvName: 'PMS_PLATFORM_PENDING_ACTION_TOKEN',
      pendingActionTimeoutMs: 5000,
      allowedChatIds: ['fixture-chat-allowed'],
      allowedOpenIds: ['fixture-user-allowed'],
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
        actor: { openId: 'fixture-user-allowed' },
        target: { channel: 'feishu', chatId: 'fixture-chat-denied', messageId: 'msg-denied-chat' },
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
        actor: { openId: 'fixture-user-denied' },
        target: { channel: 'feishu', chatId: 'fixture-chat-allowed', messageId: 'msg-denied-actor' },
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

  it('forwards authorized generic command turns to ai-conversation with adapter auth and delivers replies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      status: 'handled',
      intent: 'conversation.generic',
      replies: [{ type: 'text', text: '收到。我可以查询 PMS 房态或发起预演。' }]
    }), { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const sendNotification = vi.fn().mockResolvedValue({
      providerKey: 'ai-conversation',
      deliveryId: 'delivery-1',
      channel: 'feishu',
      status: 'delivered'
    });
    let handleTurn: Parameters<AdapterRuntimeDeps['createLongConnectionIngress']>[1] | undefined;
    const config = createConfig('long_connection');
    config.providers = {
      keys: ['warning-agent', 'pms-checkout'],
      defaultProvider: 'pms-checkout',
      allowProviderOverride: false,
      webhookAuthToken: undefined
    };
    config.pmsCheckout = {
      callbackTimeoutMs: 5000,
      pendingActionCallbackMode: 'platform',
      pendingActionBaseUrl: 'http://127.0.0.1:8791/',
      pendingActionToken: 'platform-token-1',
      pendingActionTokenEnvName: 'PMS_PLATFORM_PENDING_ACTION_TOKEN',
      pendingActionTimeoutMs: 5000,
      allowedChatIds: ['fixture-chat-allowed'],
      allowedOpenIds: ['fixture-user-allowed'],
      allowedUserIds: [],
      allowedUnionIds: []
    };
    config.conversation = {
      turnUrl: 'http://127.0.0.1:8791/conversation/feishu-turn',
      inboundAuthToken: 'conversation-token-1',
      inboundAuthHeader: 'X-AI-CONVERSATION-TOKEN',
      inboundAuthEnvName: 'AI_CONVERSATION_INBOUND_AUTH_TOKEN',
      turnTimeoutMs: 5000,
      allowedChatIds: ['fixture-chat-allowed'],
      allowedOpenIds: ['fixture-user-allowed'],
      allowedUserIds: [],
      allowedUnionIds: []
    };

    try {
      createAdapterRuntime(config, {
        createClient: () => createFeishuClientStub(),
        createBitableClient: () => createBitableClientStub(),
        createReplySink: () => ({ sendNotification }),
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
        turnId: 'msg-conversation-1',
        channel: 'feishu',
        intent: 'command',
        receivedAt: '2026-04-27T00:00:00.000Z',
        actor: { openId: 'fixture-user-allowed' },
        target: { channel: 'feishu', chatId: 'fixture-chat-allowed', messageId: 'msg-conversation-1' },
        text: 'hello, can you help summarize today?',
        rawEvent: {},
        metadata: { eventType: 'im.message.receive_v1' }
      }, {
        source: 'long_connection',
        rawEvent: {}
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://127.0.0.1:8791/conversation/feishu-turn');
      expect(init?.headers).toMatchObject({
        'content-type': 'application/json',
        'X-AI-CONVERSATION-TOKEN': 'conversation-token-1'
      });
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        source: 'adapter-feishu',
        turn: {
          turnId: 'msg-conversation-1',
          channel: 'feishu',
          text: 'hello, can you help summarize today?'
        }
      });
      expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({
        providerKey: 'ai-conversation',
        title: 'PMS智能助手',
        summary: '收到。我可以查询 PMS 房态或发起预演。',
        target: { channel: 'feishu', chatId: 'fixture-chat-allowed', messageId: 'msg-conversation-1' }
      }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('forwards authorized command turns to pms-agent-v2 and delivers AgentResult text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: 'text', text: '今晚可订。' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const sendNotification = vi.fn().mockResolvedValue({
      providerKey: 'pms-agent-v2',
      deliveryId: 'delivery-1',
      channel: 'feishu',
      status: 'delivered'
    });
    let handleTurn: Parameters<AdapterRuntimeDeps['createLongConnectionIngress']>[1] | undefined;
    const config = createConfig('long_connection');
    config.pmsAgent = {
      turnUrl: 'http://127.0.0.1:8795/v1/feishu-turn',
      authToken: 'agent-token-1',
      authHeader: 'X-PMS-AGENT-TOKEN',
      authEnvName: 'PMS_AGENT_AUTH_TOKEN',
      turnUrlEnvName: 'PMS_AGENT_TURN_URL',
      turnTimeoutMs: 5000,
      allowedChatIds: ['fixture-chat-allowed'],
      allowedOpenIds: ['fixture-user-allowed'],
      allowedUserIds: [],
      allowedUnionIds: []
    };

    try {
      createAdapterRuntime(config, {
        createClient: () => createFeishuClientStub(),
        createBitableClient: () => createBitableClientStub(),
        createReplySink: () => ({ sendNotification }),
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
        turnId: 'msg-pms-agent-1',
        channel: 'feishu',
        intent: 'command',
        receivedAt: '2026-05-06T12:00:00.000Z',
        actor: { openId: 'fixture-user-allowed', tenantKey: 'tenant-1' },
        target: { channel: 'feishu', chatId: 'fixture-chat-allowed', messageId: 'msg-pms-agent-1' },
        text: '查今晚房态',
        rawEvent: {},
        metadata: { eventType: 'im.message.receive_v1' }
      }, {
        source: 'long_connection',
        rawEvent: {}
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://127.0.0.1:8795/v1/feishu-turn');
      expect(init?.headers).toMatchObject({
        'content-type': 'application/json',
        'X-PMS-AGENT-TOKEN': 'agent-token-1'
      });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        channel: 'feishu',
        tenantId: 'tenant-1',
        sessionId: 'fixture-chat-allowed',
        messageId: 'msg-pms-agent-1',
        message: { text: '查今晚房态' }
      });
      expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({
        providerKey: 'pms-agent-v2',
        title: 'PMS智能助手',
        summary: '今晚可订。',
        target: { channel: 'feishu', chatId: 'fixture-chat-allowed', messageId: 'msg-pms-agent-1' }
      }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('delivers ai-conversation reservation confirmation cards through adapter-owned pending state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      status: 'handled',
      intent: 'pms.reservation.workflow',
      replies: [
        { type: 'text', text: '预订确认卡片已准备好；这还不是最终预订，真正确认仍需点击飞书卡片按钮。' },
        {
          type: 'reservation_confirmation_card',
          text: '预订确认卡片已准备好；这还不是最终预订，真正确认仍需点击飞书卡片按钮。',
          contract: 'ai-conversation.reservation-confirmation-card.v1',
          operation: 'pms.reservation.prepare_confirm',
          card: {
            title: '预订确认',
            summary: 'PMS 已生成待确认的预订草稿；请人工核对后点击卡片按钮。',
            bodyMarkdown: '**这不是最终预订确认。**\n点击卡片按钮后才会转交 PMS pending-action 确认。',
            facts: [{ label: '入住日期', value: '2026-05-07' }]
          },
          pendingAction: {
            pendingActionRef: 'pending-reservation-raw-runtime',
            cardPayloadRef: 'card-reservation-raw-runtime',
            quoteRef: 'quote-reservation-raw-runtime',
            propertyId: 'default',
            status: 'awaitingConfirmation',
            confirmationMode: 'typedCardOnly',
            mutationStatus: 'none'
          },
          callback: {
            owner: 'adapter-feishu',
            targetOwner: 'pms-platform',
            confirmOperation: 'pms.pending_action.confirm',
            cancelOperation: 'pms.pending_action.cancel',
            correlationId: 'corr-reservation-runtime',
            naturalLanguageConfirmAllowed: false
          },
          safety: {
            customerTextContainsRawRefs: false,
            durableAiConversationMemoryAllowed: false,
            rawRefsConfinedToAdapterCallbackBoundary: true
          },
          ownerBoundaries: {
            cardPayload: 'pms-platform produces cardPayloadRef; adapter-feishu renders Feishu card from this delivery envelope.',
            pendingAction: 'pms-platform owns pendingActionRef, expiry, idempotency, and pending-action state.',
            callback: 'adapter-feishu owns card click ingress and forwards only fixed pending-action callbacks to pms-platform.'
          }
        }
      ]
    }), { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const sendNotification = vi.fn().mockResolvedValue({
      providerKey: 'ai-conversation',
      deliveryId: 'delivery-1',
      channel: 'feishu',
      status: 'delivered'
    });
    let handleTurn: Parameters<AdapterRuntimeDeps['createLongConnectionIngress']>[1] | undefined;
    const config = createConfig('long_connection');
    config.providers = {
      keys: ['warning-agent', 'pms-checkout'],
      defaultProvider: 'pms-checkout',
      allowProviderOverride: false,
      webhookAuthToken: undefined
    };
    config.conversation = {
      turnUrl: 'http://127.0.0.1:8791/conversation/feishu-turn',
      inboundAuthToken: 'conversation-token-1',
      inboundAuthHeader: 'X-AI-CONVERSATION-TOKEN',
      inboundAuthEnvName: 'AI_CONVERSATION_INBOUND_AUTH_TOKEN',
      turnTimeoutMs: 5000,
      allowedChatIds: ['fixture-chat-allowed'],
      allowedOpenIds: ['fixture-user-allowed'],
      allowedUserIds: [],
      allowedUnionIds: []
    };

    try {
      const runtime = createAdapterRuntime(config, {
        createClient: () => createFeishuClientStub(),
        createBitableClient: () => createBitableClientStub(),
        createReplySink: () => ({ sendNotification }),
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
        turnId: 'msg-conversation-reservation-card',
        channel: 'feishu',
        intent: 'command',
        receivedAt: '2026-05-05T00:00:00.000Z',
        actor: { openId: 'fixture-user-allowed' },
        target: { channel: 'feishu', chatId: 'fixture-chat-allowed', messageId: 'msg-conversation-reservation-card' },
        text: '给我飞书卡片',
        rawEvent: {},
        metadata: { eventType: 'im.message.receive_v1' }
      }, { source: 'long_connection', rawEvent: {} });

      expect(sendNotification).toHaveBeenCalledTimes(2);
      expect(sendNotification).toHaveBeenNthCalledWith(1, expect.objectContaining({
        providerKey: 'ai-conversation',
        summary: '预订确认卡片已准备好；这还不是最终预订，真正确认仍需点击飞书卡片按钮。'
      }));
      const cardNotification = sendNotification.mock.calls[1][0];
      expect(cardNotification).toEqual(expect.objectContaining({
        providerKey: AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY,
        title: '预订确认',
        target: { channel: 'feishu', chatId: 'fixture-chat-allowed', messageId: 'msg-conversation-reservation-card' },
        metadata: expect.objectContaining({
          callbackOwner: 'adapter-feishu',
          targetOwner: 'pms-platform',
          naturalLanguageConfirmAllowed: false
        })
      }));
      expect(cardNotification.actions).toEqual([
        expect.objectContaining({
          actionId: AI_CONVERSATION_RESERVATION_CARD_ACTION_ID,
          label: '确认预订',
          payload: expect.objectContaining({ operation: 'pms.pending_action.confirm' })
        }),
        expect.objectContaining({
          actionId: AI_CONVERSATION_RESERVATION_CARD_ACTION_ID,
          label: '取消',
          payload: expect.objectContaining({ operation: 'pms.pending_action.cancel' })
        })
      ]);
      expect(JSON.stringify(cardNotification)).not.toContain('pending-reservation-raw-runtime');
      expect(JSON.stringify(cardNotification)).not.toContain('card-reservation-raw-runtime');
      const pending = runtime.pendingStore.list(AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY)[0];
      expect(pending).toEqual(expect.objectContaining({
        providerKey: AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY,
        actionId: AI_CONVERSATION_RESERVATION_CARD_ACTION_ID,
        payload: expect.objectContaining({
          callbackOwner: 'adapter-feishu',
          targetOwner: 'pms-platform',
          naturalLanguageConfirmAllowed: false,
          pendingAction: expect.objectContaining({
            pendingActionRef: 'pending-reservation-raw-runtime',
            cardPayloadRef: 'card-reservation-raw-runtime',
            quoteRef: 'quote-reservation-raw-runtime'
          })
        })
      }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('accepts only the fixed reservation card delivery boundary', () => {
    expect(conversationReservationCardReplies({ replies: [reservationCardReply()] })).toHaveLength(1);
    expect(conversationReservationCardReplies({
      replies: [reservationCardReply({
        callback: {
          owner: 'ai-conversation',
          targetOwner: 'pms-platform',
          confirmOperation: 'pms.pending_action.confirm',
          cancelOperation: 'pms.pending_action.cancel',
          correlationId: 'corr-reservation-runtime',
          naturalLanguageConfirmAllowed: true
        }
      })]
    })).toEqual([]);
    expect(conversationReservationCardReplies({
      replies: [reservationCardReply({
        pendingAction: {
          pendingActionRef: 'pending-reservation-raw-runtime',
          cardPayloadRef: 'card-reservation-raw-runtime',
          quoteRef: 'quote-reservation-raw-runtime',
          propertyId: 'default',
          status: 'confirmed',
          confirmationMode: 'typedCardOnly',
          mutationStatus: 'deferred'
        }
      })]
    })).toEqual([]);
  });

  it('sends an honest reservation card capability gap when callback forwarding is unavailable', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      status: 'handled',
      intent: 'pms.reservation.workflow',
      replies: [
        { type: 'text', text: '预订确认卡片已准备好；这还不是最终预订，真正确认仍需点击飞书卡片按钮。' },
        reservationCardReply()
      ]
    }), { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const sendNotification = vi.fn().mockResolvedValue({
      providerKey: 'ai-conversation',
      deliveryId: 'delivery-1',
      channel: 'feishu',
      status: 'delivered'
    });
    let handleTurn: Parameters<AdapterRuntimeDeps['createLongConnectionIngress']>[1] | undefined;
    const config = createConfig('long_connection');
    config.pmsCheckout = {
      ...config.pmsCheckout,
      pendingActionBaseUrl: undefined,
      pendingActionToken: undefined
    };
    config.conversation = {
      turnUrl: 'http://127.0.0.1:8791/conversation/feishu-turn',
      inboundAuthToken: 'conversation-token-1',
      inboundAuthHeader: 'X-AI-CONVERSATION-TOKEN',
      inboundAuthEnvName: 'AI_CONVERSATION_INBOUND_AUTH_TOKEN',
      turnTimeoutMs: 5000,
      allowedChatIds: ['fixture-chat-allowed'],
      allowedOpenIds: ['fixture-user-allowed'],
      allowedUserIds: [],
      allowedUnionIds: []
    };

    try {
      const runtime = createAdapterRuntime(config, {
        createClient: () => createFeishuClientStub(),
        createBitableClient: () => createBitableClientStub(),
        createReplySink: () => ({ sendNotification }),
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
        turnId: 'msg-conversation-reservation-card-gap',
        channel: 'feishu',
        intent: 'command',
        receivedAt: '2026-05-05T00:00:00.000Z',
        actor: { openId: 'fixture-user-allowed' },
        target: { channel: 'feishu', chatId: 'fixture-chat-allowed', messageId: 'msg-conversation-reservation-card-gap' },
        text: '给我飞书卡片',
        rawEvent: {},
        metadata: { eventType: 'im.message.receive_v1' }
      }, { source: 'long_connection', rawEvent: {} });

      expect(sendNotification).toHaveBeenCalledTimes(2);
      const gapNotification = sendNotification.mock.calls[1][0];
      expect(gapNotification).toEqual(expect.objectContaining({
        providerKey: 'ai-conversation',
        summary: expect.stringContaining('未配置 pending-action 回调'),
        rawPayload: expect.objectContaining({ delivery: 'capability_gap', rawRefsLogged: false })
      }));
      expect(JSON.stringify(gapNotification)).not.toContain('pending-reservation-raw-runtime');
      expect(JSON.stringify(gapNotification)).not.toContain('card-reservation-raw-runtime');
      expect(runtime.pendingStore.list(AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY)).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('suppresses duplicate ai-conversation turn forwarding and delivery within the dedupe window', async () => {
    let markForwardStarted!: () => void;
    let resolveForward!: (response: Response) => void;
    const forwardStarted = new Promise<void>((resolve) => {
      markForwardStarted = resolve;
    });
    const responseReady = new Promise<Response>((resolve) => {
      resolveForward = resolve;
    });
    const fetchMock = vi.fn().mockImplementation(() => {
      markForwardStarted();
      return responseReady;
    });
    vi.stubGlobal('fetch', fetchMock);
    const sendNotification = vi.fn().mockResolvedValue({
      providerKey: 'ai-conversation',
      deliveryId: 'delivery-1',
      channel: 'feishu',
      status: 'delivered'
    });
    let handleTurn: Parameters<AdapterRuntimeDeps['createLongConnectionIngress']>[1] | undefined;
    const config = createConfig('long_connection');
    config.providers = {
      keys: ['warning-agent', 'pms-checkout'],
      defaultProvider: 'pms-checkout',
      allowProviderOverride: false,
      webhookAuthToken: undefined
    };
    config.pmsCheckout = {
      callbackTimeoutMs: 5000,
      pendingActionCallbackMode: 'platform',
      pendingActionBaseUrl: 'http://127.0.0.1:8791/',
      pendingActionToken: 'platform-token-1',
      pendingActionTokenEnvName: 'PMS_PLATFORM_PENDING_ACTION_TOKEN',
      pendingActionTimeoutMs: 5000,
      allowedChatIds: ['fixture-chat-allowed'],
      allowedOpenIds: ['fixture-user-allowed'],
      allowedUserIds: [],
      allowedUnionIds: []
    };
    config.conversation = {
      turnUrl: 'http://127.0.0.1:8791/conversation/feishu-turn',
      inboundAuthToken: 'conversation-token-1',
      inboundAuthHeader: 'X-AI-CONVERSATION-TOKEN',
      inboundAuthEnvName: 'AI_CONVERSATION_INBOUND_AUTH_TOKEN',
      turnTimeoutMs: 5000,
      allowedChatIds: ['fixture-chat-allowed'],
      allowedOpenIds: ['fixture-user-allowed'],
      allowedUserIds: [],
      allowedUnionIds: []
    };

    try {
      createAdapterRuntime(config, {
        createClient: () => createFeishuClientStub(),
        createBitableClient: () => createBitableClientStub(),
        createReplySink: () => ({ sendNotification }),
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

      const turn = {
        turnId: 'msg-conversation-dedupe-1',
        channel: 'feishu' as const,
        intent: 'command' as const,
        receivedAt: '2026-04-27T00:00:00.000Z',
        actor: { openId: 'fixture-user-allowed' },
        target: { channel: 'feishu' as const, chatId: 'fixture-chat-allowed', messageId: 'msg-conversation-dedupe-1' },
        text: '要定房间',
        rawEvent: {},
        metadata: { eventType: 'im.message.receive_v1' }
      };
      const first = handleTurn?.(turn, { source: 'long_connection', rawEvent: {} });
      await forwardStarted;
      await handleTurn?.(turn, { source: 'long_connection', rawEvent: {} });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sendNotification).not.toHaveBeenCalled();

      resolveForward(new Response(JSON.stringify({
        ok: true,
        status: 'handled',
        intent: 'conversation.generic',
        replies: [{ type: 'text', text: '收到。我可以继续帮你处理。' }]
      }), { status: 202 }));
      await first;
      await handleTurn?.(turn, { source: 'long_connection', rawEvent: {} });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sendNotification).toHaveBeenCalledTimes(1);
      expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({
        providerKey: 'ai-conversation',
        title: 'PMS智能助手',
        summary: '收到。我可以继续帮你处理。',
        target: { channel: 'feishu', chatId: 'fixture-chat-allowed', messageId: 'msg-conversation-dedupe-1' }
      }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('delivers ai-conversation safe replies even when the forward response is non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      status: 'blocked',
      intent: 'pms.reservation.workflow',
      replies: [{ type: 'text', text: '已收到 PMS 工具证据，但最终回复生成未通过安全校验；请稍后重试。' }]
    }), { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    const sendNotification = vi.fn().mockResolvedValue({
      providerKey: 'ai-conversation',
      deliveryId: 'delivery-1',
      channel: 'feishu',
      status: 'delivered'
    });
    let handleTurn: Parameters<AdapterRuntimeDeps['createLongConnectionIngress']>[1] | undefined;
    const config = createConfig('long_connection');
    config.providers = {
      keys: ['warning-agent', 'pms-checkout'],
      defaultProvider: 'pms-checkout',
      allowProviderOverride: false,
      webhookAuthToken: undefined
    };
    config.pmsCheckout = {
      callbackTimeoutMs: 5000,
      pendingActionCallbackMode: 'platform',
      pendingActionBaseUrl: 'http://127.0.0.1:8791/',
      pendingActionToken: 'platform-token-1',
      pendingActionTokenEnvName: 'PMS_PLATFORM_PENDING_ACTION_TOKEN',
      pendingActionTimeoutMs: 5000,
      allowedChatIds: ['fixture-chat-allowed'],
      allowedOpenIds: ['fixture-user-allowed'],
      allowedUserIds: [],
      allowedUnionIds: []
    };
    config.conversation = {
      turnUrl: 'http://127.0.0.1:8791/conversation/feishu-turn',
      inboundAuthToken: 'conversation-token-1',
      inboundAuthHeader: 'X-AI-CONVERSATION-TOKEN',
      inboundAuthEnvName: 'AI_CONVERSATION_INBOUND_AUTH_TOKEN',
      turnTimeoutMs: 5000,
      allowedChatIds: ['fixture-chat-allowed'],
      allowedOpenIds: ['fixture-user-allowed'],
      allowedUserIds: [],
      allowedUnionIds: []
    };

    try {
      createAdapterRuntime(config, {
        createClient: () => createFeishuClientStub(),
        createBitableClient: () => createBitableClientStub(),
        createReplySink: () => ({ sendNotification }),
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
        turnId: 'msg-conversation-blocked-reply',
        channel: 'feishu',
        intent: 'command',
        receivedAt: '2026-04-27T00:00:00.000Z',
        actor: { openId: 'fixture-user-allowed' },
        target: { channel: 'feishu', chatId: 'fixture-chat-allowed', messageId: 'msg-conversation-blocked-reply' },
        text: '要订房 大后天',
        rawEvent: {},
        metadata: { eventType: 'im.message.receive_v1' }
      }, {
        source: 'long_connection',
        rawEvent: {}
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({
        providerKey: 'ai-conversation',
        title: 'PMS智能助手',
        summary: '已收到 PMS 工具证据，但最终回复生成未通过安全校验；请稍后重试。',
        target: { channel: 'feishu', chatId: 'fixture-chat-allowed', messageId: 'msg-conversation-blocked-reply' }
      }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('routes deterministic PMS checkout natural-language turns through ai-conversation when configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, status: 'handled', intent: 'pms.checkout.start_dry_run' }), { status: 202 }));
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
      callbackTimeoutMs: 5000,
      pendingActionCallbackMode: 'platform',
      pendingActionBaseUrl: 'http://127.0.0.1:8791/',
      pendingActionToken: 'platform-token-1',
      pendingActionTokenEnvName: 'PMS_PLATFORM_PENDING_ACTION_TOKEN',
      pendingActionTimeoutMs: 5000,
      allowedChatIds: ['fixture-chat-allowed'],
      allowedOpenIds: [],
      allowedUserIds: [],
      allowedUnionIds: []
    };
    config.conversation = {
      turnUrl: 'http://127.0.0.1:8791/conversation/feishu-turn',
      inboundAuthToken: 'conversation-token-1',
      inboundAuthHeader: 'X-AI-CONVERSATION-TOKEN',
      inboundAuthEnvName: 'AI_CONVERSATION_INBOUND_AUTH_TOKEN',
      turnTimeoutMs: 5000,
      allowedChatIds: ['fixture-chat-allowed'],
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
        turnId: 'msg-checkout-1',
        channel: 'feishu',
        intent: 'command',
        receivedAt: '2026-04-27T00:00:00.000Z',
        actor: { openId: 'fixture-user-allowed' },
        target: { channel: 'feishu', chatId: 'fixture-chat-allowed', messageId: 'msg-checkout-1' },
        text: 'room 1001 checkout',
        rawEvent: {},
        metadata: { eventType: 'im.message.receive_v1' }
      }, {
        source: 'long_connection',
        rawEvent: {}
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://127.0.0.1:8791/conversation/feishu-turn');
      expect(init?.headers).toMatchObject({
        'content-type': 'application/json',
        'X-AI-CONVERSATION-TOKEN': 'conversation-token-1'
      });
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        source: 'adapter-feishu',
        turn: {
          turnId: 'msg-checkout-1',
          channel: 'feishu',
          text: 'room 1001 checkout'
        }
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('blocks unauthorized generic and PMS turns before conversation forwarding', async () => {
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
      callbackTimeoutMs: 5000,
      pendingActionCallbackMode: 'platform',
      pendingActionBaseUrl: 'http://127.0.0.1:8791/',
      pendingActionToken: 'platform-token-1',
      pendingActionTokenEnvName: 'PMS_PLATFORM_PENDING_ACTION_TOKEN',
      pendingActionTimeoutMs: 5000,
      allowedChatIds: ['fixture-chat-allowed'],
      allowedOpenIds: ['fixture-user-allowed'],
      allowedUserIds: [],
      allowedUnionIds: []
    };
    config.conversation = {
      turnUrl: 'http://127.0.0.1:8791/conversation/feishu-turn',
      inboundAuthToken: 'conversation-token-1',
      inboundAuthHeader: 'X-AI-CONVERSATION-TOKEN',
      inboundAuthEnvName: 'AI_CONVERSATION_INBOUND_AUTH_TOKEN',
      turnTimeoutMs: 5000,
      allowedChatIds: ['fixture-chat-allowed'],
      allowedOpenIds: ['fixture-user-allowed'],
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
        turnId: 'msg-denied-generic',
        channel: 'feishu',
        intent: 'command',
        receivedAt: '2026-04-27T00:00:00.000Z',
        actor: { openId: 'fixture-user-allowed' },
        target: { channel: 'feishu', chatId: 'fixture-chat-denied', messageId: 'msg-denied-generic' },
        text: 'hello there',
        rawEvent: {},
        metadata: { eventType: 'im.message.receive_v1' }
      }, {
        source: 'long_connection',
        rawEvent: {}
      });

      await handleTurn?.({
        turnId: 'msg-denied-pms',
        channel: 'feishu',
        intent: 'command',
        receivedAt: '2026-04-27T00:00:01.000Z',
        actor: { openId: 'fixture-user-denied' },
        target: { channel: 'feishu', chatId: 'fixture-chat-allowed', messageId: 'msg-denied-pms' },
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

  it('contains conversation forwarding outages at the adapter boundary', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('conversation offline'));
    vi.stubGlobal('fetch', fetchMock);
    let handleTurn: Parameters<AdapterRuntimeDeps['createLongConnectionIngress']>[1] | undefined;
    const config = createConfig('long_connection');
    config.providers = {
      keys: ['warning-agent'],
      defaultProvider: 'warning-agent',
      allowProviderOverride: false,
      webhookAuthToken: undefined
    };
    config.conversation = {
      turnUrl: 'http://127.0.0.1:8791/conversation/feishu-turn',
      inboundAuthToken: 'conversation-token-1',
      inboundAuthHeader: 'X-AI-CONVERSATION-TOKEN',
      inboundAuthEnvName: 'AI_CONVERSATION_INBOUND_AUTH_TOKEN',
      turnTimeoutMs: 5000,
      allowedChatIds: ['fixture-chat-allowed'],
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
        createLongConnectionIngress: (_config, nextHandleTurn) => {
          handleTurn = nextHandleTurn;
          return {
            start: vi.fn().mockResolvedValue(undefined),
            stop: vi.fn().mockResolvedValue(undefined)
          };
        }
      });

      await expect(handleTurn?.({
        turnId: 'msg-conversation-outage',
        channel: 'feishu',
        intent: 'command',
        receivedAt: '2026-04-27T00:00:00.000Z',
        actor: { openId: 'fixture-user-allowed' },
        target: { channel: 'feishu', chatId: 'fixture-chat-allowed', messageId: 'msg-conversation-outage' },
        text: 'hello there',
        rawEvent: {},
        metadata: { eventType: 'im.message.receive_v1' }
      }, {
        source: 'long_connection',
        rawEvent: {}
      })).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledTimes(1);
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
      callbackTimeoutMs: 5000,
      pendingActionCallbackMode: 'platform',
      pendingActionBaseUrl: 'http://127.0.0.1:8791/',
      pendingActionToken: 'platform-token-1',
      pendingActionTokenEnvName: 'PMS_PLATFORM_PENDING_ACTION_TOKEN',
      pendingActionTimeoutMs: 5000,
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
        providers: ['warning-agent', 'pms-checkout'],
        pmsCheckout: {
          enabled: true,
          callbackMode: 'platform',
          platformPendingActionConfigured: true,
          platformTokenEnvName: 'PMS_PLATFORM_PENDING_ACTION_TOKEN',
          rawCallbackUrlLogged: false,
          rawPlatformBaseUrlLogged: false,
          rawTokenLogged: false
        }
      }
    });
    expect(JSON.stringify(response)).not.toContain('callback-token-1');
    expect(JSON.stringify(response)).not.toContain('platform-token-1');
    expect(JSON.stringify(response)).not.toContain('127.0.0.1');
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
