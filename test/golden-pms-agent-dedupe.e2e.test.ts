import { describe, expect, it, vi } from 'vitest';
import { createAdapterRuntime, type AdapterRuntimeDeps } from '../src/runtime.js';
import type { AdapterConfig } from '../src/config.js';

describe('golden PMS Agent delivery E2E', () => {
  it('releases command-turn dedupe after PMS Agent timeout so the Feishu retry reaches the new code path', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new DOMException('operation timed out', 'AbortError'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ type: 'text', text: '已恢复，可以继续处理。' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const sendNotification = vi.fn().mockResolvedValue({
      providerKey: 'pms-agent-v2',
      deliveryId: 'delivery-golden-1',
      channel: 'feishu',
      status: 'delivered'
    });
    let handleTurn: Parameters<AdapterRuntimeDeps['createLongConnectionIngress']>[1] | undefined;

    try {
      createAdapterRuntime(goldenConfig(), {
        createClient: () => ({ sendText: vi.fn(), sendCard: vi.fn() }),
        createBitableClient: () => ({ createRecord: vi.fn(), getRecord: vi.fn(), listRecords: vi.fn(), updateRecord: vi.fn(), getForm: vi.fn(), listFormFields: vi.fn(), listTableFields: vi.fn() }),
        createReplySink: () => ({ sendNotification }),
        createHttpServer: () => ({ listen: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) }),
        createLongConnectionIngress: (_config, nextHandleTurn) => {
          handleTurn = nextHandleTurn;
          return { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined) };
        }
      });

      const turn = goldenPmsAgentTurn('golden-feishu-message-1');
      await handleTurn?.(turn, { source: 'long_connection', rawEvent: {} });
      await handleTurn?.(turn, { source: 'long_connection', rawEvent: {} });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(sendNotification).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8792/v1/feishu-turn');
      expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:8792/v1/feishu-turn');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

function goldenConfig(): AdapterConfig {
  return {
    service: { host: '127.0.0.1', port: 8787, publicBaseUrl: 'http://localhost:8787' },
    feishu: {
      appId: 'app-id',
      appSecret: 'app-secret',
      ingressMode: 'long_connection',
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
      defaultTarget: { appToken: 'app_token_default', tableId: 'tbl_default', formId: 'form_default' }
    },
    pmsBase: { webhookAuthToken: undefined },
    state: { dedupeTtlSeconds: 300, pendingTtlSeconds: 900 },
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
    pmsAgent: {
      turnUrl: 'http://127.0.0.1:8792/v1/feishu-turn',
      authToken: 'agent-token-1',
      authHeader: 'X-PMS-AGENT-TOKEN',
      authEnvName: 'PMS_AGENT_AUTH_TOKEN',
      turnUrlEnvName: 'PMS_AGENT_TURN_URL',
      turnTimeoutMs: 5000,
      allowedChatIds: ['fixture-chat-allowed'],
      allowedOpenIds: ['fixture-user-allowed'],
      allowedUserIds: [],
      allowedUnionIds: []
    }
  };
}

function goldenPmsAgentTurn(turnId: string) {
  return {
    turnId,
    channel: 'feishu' as const,
    intent: 'command' as const,
    receivedAt: '2026-05-10T00:00:00.000Z',
    actor: { openId: 'fixture-user-allowed', tenantKey: 'tenant-1' },
    target: { channel: 'feishu' as const, chatId: 'fixture-chat-allowed', messageId: turnId },
    text: '继续给莉莉订两间花园别墅',
    rawEvent: {},
    metadata: { eventType: 'im.message.receive_v1' }
  };
}
