import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createBitableClient, type BitableClient } from './channels/feishu/bitableClient.js';
import { createFeishuClient, type FeishuClient } from './channels/feishu/client.js';
import {
  createLongConnectionIngress,
  type LongConnectionConfig,
  type LongConnectionDeps,
  type LongConnectionIngress,
  type LongConnectionOptions
} from './channels/feishu/longConnection.js';
import { createReplySink, type ReplySink } from './channels/feishu/replySink.js';
import { type DispatchRequest, dispatchWebhookRequest } from './channels/feishu/webhook.js';
import { readRequestBody, respondJson } from './channels/feishu/webhookSecurity.js';
import type { AdapterConfig } from './config.js';
import { createConversationHttpTurnForwarder } from './conversation/forwarder.js';
import { type InboundTurn, type JsonRecord, type ProviderKey } from './core/contracts.js';
import { loadManagedFormRegistry, type ManagedFormRegistry } from './forms/registry.js';
import {
  createProviderRegistry,
  registerProvider,
  type ProviderRegistry
} from './providers/registry.js';
import { createProviderRouter, type ProviderRouter } from './providers/router.js';
import {
  PMS_CHECKOUT_PROVIDER_KEY,
  createPmsCheckoutHttpCallbackForwarder,
  createPmsCheckoutHttpInboundTurnForwarder,
  createPmsCheckoutProvider
} from './providers/pms-checkout/index.js';
import {
  WARNING_AGENT_PROVIDER_KEY,
  createWarningAgentProvider,
  getWarningAgentDedupeKey,
  isWarningAgentNotificationPayload
} from './providers/warning-agent/index.js';
import { dispatchCardActionRequest, type CardActionRequest } from './server/cardAction.js';
import { dispatchFormWebhookRequest } from './server/formWebhook.js';
import { dispatchAdapterHttpRequest, type AdapterHttpRequest, type AdapterHttpResponse } from './server/httpHost.js';
import { dispatchProviderWebhookRequest } from './server/providerWebhook.js';
import { createAlertDeduper, type AlertDeduper } from './state/dedupe.js';
import { createPendingStore, type PendingStore } from './state/pendingStore.js';
import { createTableWriteQueue } from './state/tableWriteQueue.js';

export interface AdapterRuntime {
  providerRegistry: ProviderRegistry;
  providerRouter: ProviderRouter;
  deduper: AlertDeduper;
  pendingStore: PendingStore;
  formRegistry?: ManagedFormRegistry;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface AdapterHttpServer {
  listen(): Promise<void>;
  close(): Promise<void>;
}

export interface AdapterRuntimeDeps {
  createClient(config: { appId: string; appSecret: string }): FeishuClient;
  createBitableClient(config: { appId: string; appSecret: string }): BitableClient;
  createReplySink(client: FeishuClient): ReplySink;
  createLongConnectionIngress(config: LongConnectionConfig, handleTurn: Parameters<typeof createLongConnectionIngress>[1], deps?: LongConnectionDeps, options?: LongConnectionOptions): LongConnectionIngress;
  createHttpServer(
    config: { host: string; port: number },
    handleRequest: (request: AdapterHttpRequest) => Promise<AdapterHttpResponse>
  ): AdapterHttpServer;
}

const defaultDeps: AdapterRuntimeDeps = {
  createClient(config) {
    return createFeishuClient(config);
  },
  createBitableClient(config) {
    return createBitableClient(config);
  },
  createReplySink(client) {
    return createReplySink(client);
  },
  createLongConnectionIngress(config, handleTurn, deps, options) {
    return createLongConnectionIngress(config, handleTurn, deps, options);
  },
  createHttpServer(config, handleRequest) {
    const server = createServer(async (req, res) => {
      await handleNodeRequest(req, res, handleRequest);
    });

    return {
      listen() {
        return listenServer(server, config.host, config.port);
      },
      close() {
        return closeServer(server);
      }
    };
  }
};

export function createAdapterRuntime(
  config: AdapterConfig,
  deps: AdapterRuntimeDeps = defaultDeps
): AdapterRuntime {
  const logInboundTurns = process.env.ADAPTER_FEISHU_LOG_INBOUND_TURNS === 'true';
  const logInboundSummary = process.env.ADAPTER_FEISHU_LOG_INBOUND_SUMMARY === 'true';
  const client = deps.createClient({
    appId: config.feishu.appId,
    appSecret: config.feishu.appSecret
  });
  const replySink = deps.createReplySink(client);
  const bitableClient = deps.createBitableClient({
    appId: config.feishu.appId,
    appSecret: config.feishu.appSecret
  });

  const providerRegistry = createProviderRegistry({
    allowedProviderKeys: config.providers.keys,
    defaultProviderKey: config.providers.defaultProvider
  });

  if (config.providers.keys.includes(WARNING_AGENT_PROVIDER_KEY)) {
    registerProvider(providerRegistry, createWarningAgentProvider());
  }

  const pmsCheckoutConfig = config.pmsCheckout;
  const pmsCheckoutCallbackForwarder = pmsCheckoutConfig?.callbackUrl && pmsCheckoutConfig.callbackToken
    ? createPmsCheckoutHttpCallbackForwarder({
        url: pmsCheckoutConfig.callbackUrl,
        token: pmsCheckoutConfig.callbackToken,
        headerName: pmsCheckoutConfig.callbackTokenHeader,
        timeoutMs: pmsCheckoutConfig.callbackTimeoutMs
      })
    : undefined;
  const pmsCheckoutInboundTurnForwarder = pmsCheckoutConfig?.inboundTurnUrl && pmsCheckoutConfig.callbackToken
    ? createPmsCheckoutHttpInboundTurnForwarder({
        url: pmsCheckoutConfig.inboundTurnUrl,
        token: pmsCheckoutConfig.callbackToken,
        headerName: pmsCheckoutConfig.callbackTokenHeader,
        timeoutMs: pmsCheckoutConfig.inboundTurnTimeoutMs
      })
    : undefined;
  const conversationConfig = config.conversation;
  const conversationTurnForwarder = conversationConfig.turnUrl && conversationConfig.inboundAuthToken
    ? createConversationHttpTurnForwarder({
        url: conversationConfig.turnUrl,
        token: conversationConfig.inboundAuthToken,
        headerName: conversationConfig.inboundAuthHeader,
        timeoutMs: conversationConfig.turnTimeoutMs
      })
    : undefined;

  if (config.providers.keys.includes(PMS_CHECKOUT_PROVIDER_KEY)) {
    registerProvider(providerRegistry, createPmsCheckoutProvider({
      callbackForwarder: pmsCheckoutCallbackForwarder
    }));
  }

  const providerRouter = createProviderRouter(providerRegistry, {
    defaultProviderKey: config.providers.defaultProvider,
    allowProviderOverride: config.providers.allowProviderOverride
  });
  const deduper = createAlertDeduper({
    ttlMs: config.state.dedupeTtlSeconds * 1000
  });
  const pendingStore = createPendingStore({
    ttlMs: config.state.pendingTtlSeconds * 1000,
    statePath: config.state.pendingStatePath
  });
  const tableWriteQueue = createTableWriteQueue();
  const formRegistry = config.form.registryPath
    ? loadManagedFormRegistry(config.form.registryPath)
    : undefined;
  const now = () => new Date().toISOString();

  const handleTurn: Parameters<typeof createLongConnectionIngress>[1] = async (turn) => {
    if (logInboundTurns) {
      console.log(
        JSON.stringify(
          {
            event: 'adapter_feishu_inbound_turn',
            turnId: turn.turnId,
            intent: turn.intent,
            providerKey: turn.providerKey,
            actorOpenId: turn.actor?.openId,
            actorUserId: turn.actor?.userId,
            chatId: turn.target.chatId,
            messageId: turn.target.messageId,
            text: turn.text
          },
          null,
          2
        )
      );
    }

    const resolution = providerRouter.resolve(turn);
    const provider = resolution.provider.definition;

    if (logInboundSummary) {
      logSafeInboundSummary('adapter_feishu_inbound_turn_summary', turn, resolution.providerKey);
    }

    if (turn.intent === 'command' && shouldUsePmsCheckoutDirectRoute(turn, resolution.providerKey, Boolean(conversationTurnForwarder)) && pmsCheckoutInboundTurnForwarder) {
      const authorization = authorizeAdapterOwnedTurn(turn, pmsCheckoutConfig);
      if (!authorization.ok) {
        if (logInboundSummary) {
          logSafeForwardingDecision('adapter_feishu_inbound_turn_rejected', turn, resolution.providerKey, {
            reason: authorization.reason,
            route: 'pms-checkout-direct'
          });
        }
        return;
      }

      const forwardResult = await pmsCheckoutInboundTurnForwarder.forwardTurn(turn);
      if (logInboundSummary) {
        console.log(JSON.stringify({
          event: 'adapter_feishu_inbound_turn_forwarded',
          providerKey: resolution.providerKey,
          route: 'pms-checkout-direct',
          turnHash: hashRedacted(turn.turnId),
          statusCode: forwardResult.statusCode,
          bodyStatus: typeof forwardResult.body.status === 'string' ? forwardResult.body.status : undefined,
          bodyOk: typeof forwardResult.body.ok === 'boolean' ? forwardResult.body.ok : undefined
        }));
      }
      return;
    }

    if (turn.intent === 'command' && conversationTurnForwarder) {
      const authorization = authorizeAdapterOwnedTurn(turn, conversationConfig);
      if (!authorization.ok) {
        if (logInboundSummary) {
          logSafeForwardingDecision('adapter_feishu_conversation_turn_rejected', turn, 'ai-conversation', {
            reason: authorization.reason,
            route: 'conversation'
          });
        }
        return;
      }

      try {
        const forwardResult = await conversationTurnForwarder.forwardTurn(turn);
        if (logInboundSummary) {
          console.log(JSON.stringify({
            event: 'adapter_feishu_conversation_turn_forwarded',
            providerKey: 'ai-conversation',
            route: 'conversation',
            turnHash: hashRedacted(turn.turnId),
            statusCode: forwardResult.statusCode,
            bodyStatus: typeof forwardResult.body.status === 'string' ? forwardResult.body.status : undefined,
            bodyOk: typeof forwardResult.body.ok === 'boolean' ? forwardResult.body.ok : undefined,
            intent: typeof forwardResult.body.intent === 'string' ? forwardResult.body.intent : undefined
          }));
        }
      } catch (error) {
        if (logInboundSummary) {
          logSafeForwardingDecision('adapter_feishu_conversation_turn_forward_failed', turn, 'ai-conversation', {
            route: 'conversation',
            errorName: error instanceof Error ? error.name : 'UnknownError',
            errorMessageHash: hashRedacted(error instanceof Error ? error.message : String(error))
          });
        }
      }
      return;
    }

    if (turn.intent === 'callback' && provider.handleCallback) {
      await provider.handleCallback(turn, {
        replySink,
        defaultTarget: turn.target,
        now,
        pendingStore,
        callbackForwarder: pmsCheckoutCallbackForwarder
      });
    }
  };

  const handleCardActionRequest = async (requestBody: CardActionRequest) => {
    if (logInboundSummary) {
      console.log(JSON.stringify({ event: 'adapter_feishu_card_action_received' }));
    }
    const response = await dispatchCardActionRequest(requestBody, {
      providerRouter,
      pendingStore,
      replySink,
      now,
      callbackForwarder: pmsCheckoutCallbackForwarder,
      verificationToken: config.feishu.verificationToken
    });
    if (logInboundSummary) {
      console.log(JSON.stringify({
        event: 'adapter_feishu_card_action_dispatched',
        statusCode: response.statusCode,
        message: typeof response.body.message === 'string' ? response.body.message : undefined,
        providerKey: typeof response.body.providerKey === 'string' ? response.body.providerKey : undefined,
        status: typeof response.body.status === 'string' ? response.body.status : undefined
      }));
    }
    return response;
  };

  const longConnectionIngress = deps.createLongConnectionIngress(
    {
      appId: config.feishu.appId,
      appSecret: config.feishu.appSecret
    },
    handleTurn,
    undefined,
    {
      async handleCardAction(requestBody) {
        const response = await handleCardActionRequest(requestBody);
        return response.body;
      }
    }
  );

  const httpServer = deps.createHttpServer(
    {
      host: config.service.host,
      port: config.service.port
    },
    async (request) => {
      return dispatchAdapterHttpRequest(request, {
        ingressMode: config.feishu.ingressMode,
        providerKeys: providerRegistry.listProviders().map((entry) => entry.providerKey),
        handleFeishuWebhook(requestBody) {
          if (config.feishu.ingressMode !== 'webhook') {
            return Promise.resolve({
              statusCode: 501,
              body: {
                code: 501,
                message: 'feishu_webhook_disabled'
              }
            });
          }

          return dispatchWebhookRequest(
            requestBody,
            {
              host: config.service.host,
              port: config.service.port,
              verificationToken: config.feishu.verificationToken,
              secret: config.feishu.webhookSecret
            },
            handleTurn
          );
        },
        handleProviderWebhook(requestBody) {
          return dispatchProviderWebhookRequest(requestBody, {
            providerRouter,
            replySink,
            authToken: config.providers.webhookAuthToken,
            deduper,
            dedupeKeyFromPayload(payload, resolution) {
              if (
                resolution.providerKey === WARNING_AGENT_PROVIDER_KEY &&
                isWarningAgentNotificationPayload(payload)
              ) {
                return getWarningAgentDedupeKey(payload);
              }

              return stringField(payload, 'dedupeKey');
            },
            now,
            pendingStore,
            callbackForwarder: pmsCheckoutCallbackForwarder
          });
        },
        handleFormWebhook(requestBody) {
          return dispatchFormWebhookRequest(requestBody, {
            bitableClient,
            authToken: config.form.webhookAuthToken,
            defaultTarget: config.form.defaultTarget,
            allowTargetOverride: config.form.allowTargetOverride,
            formRegistry,
            userIdType: config.form.userIdType,
            deduper,
            tableWriteQueue
          });
        },
        handleCardAction(requestBody) {
          return handleCardActionRequest(requestBody);
        }
      });
    }
  );

  return {
    providerRegistry,
    providerRouter,
    deduper,
    pendingStore,
    formRegistry,
    async start() {
      await httpServer.listen();
      if (config.feishu.ingressMode === 'long_connection') {
        await longConnectionIngress.start();
      }
    },
    async stop() {
      if (config.feishu.ingressMode === 'long_connection') {
        await longConnectionIngress.stop();
      }
      await httpServer.close();
    }
  };
}

async function handleNodeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  handleRequest: (request: AdapterHttpRequest) => Promise<AdapterHttpResponse>
): Promise<void> {
  try {
    const rawBody = await readRequestBody(req);
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const response = await handleRequest({
      method: req.method,
      pathname: url.pathname,
      headers: req.headers,
      rawBody
    });
    respondJson(res, response.statusCode, response.body);
  } catch (error) {
    console.error('adapter-feishu request handling failed', error);
    respondJson(res, 500, {
      code: 500,
      message: 'internal_error'
    });
  }
}

function listenServer(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function stringField(payload: JsonRecord, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

interface AdapterOwnedTurnAuthorizationPolicy {
  allowedChatIds: string[];
  allowedOpenIds: string[];
  allowedUserIds: string[];
  allowedUnionIds: string[];
}

function shouldUsePmsCheckoutDirectRoute(
  turn: InboundTurn,
  resolvedProviderKey: ProviderKey,
  conversationForwardingConfigured: boolean
): boolean {
  if (resolvedProviderKey !== PMS_CHECKOUT_PROVIDER_KEY) {
    return false;
  }
  if (turn.providerKey === PMS_CHECKOUT_PROVIDER_KEY) {
    return true;
  }
  if (!conversationForwardingConfigured) {
    return true;
  }
  return isDeterministicPmsCheckoutText(turn.text);
}

function isDeterministicPmsCheckoutText(text: string | undefined): boolean {
  const normalized = text?.trim().toLowerCase() ?? '';
  if (!normalized) {
    return false;
  }
  return /\b(checkout|check-out|check\s+out)\b/.test(normalized) || normalized.includes('退房');
}

function authorizeAdapterOwnedTurn(
  turn: InboundTurn,
  policy: AdapterOwnedTurnAuthorizationPolicy | undefined
): { ok: true } | { ok: false; reason: string } {
  const allowedChatIds = policy?.allowedChatIds ?? [];
  if (allowedChatIds.length > 0 && (!turn.target.chatId || !allowedChatIds.includes(turn.target.chatId))) {
    return { ok: false, reason: 'chat_not_allowed' };
  }

  const allowedOpenIds = policy?.allowedOpenIds ?? [];
  const allowedUserIds = policy?.allowedUserIds ?? [];
  const allowedUnionIds = policy?.allowedUnionIds ?? [];
  const hasUserPolicy = allowedOpenIds.length > 0 || allowedUserIds.length > 0 || allowedUnionIds.length > 0;
  if (!hasUserPolicy) {
    return { ok: true };
  }

  if (turn.actor?.openId && allowedOpenIds.includes(turn.actor.openId)) {
    return { ok: true };
  }
  if (turn.actor?.userId && allowedUserIds.includes(turn.actor.userId)) {
    return { ok: true };
  }
  if (turn.actor?.tenantKey && allowedUnionIds.includes(turn.actor.tenantKey)) {
    return { ok: true };
  }

  return { ok: false, reason: 'actor_not_allowed' };
}

function logSafeForwardingDecision(
  event: string,
  turn: InboundTurn,
  providerKey: string,
  details: JsonRecord
): void {
  console.log(JSON.stringify({
    event,
    providerKey,
    turnHash: hashRedacted(turn.turnId),
    ...details
  }));
}

function logSafeInboundSummary(event: string, turn: InboundTurn, providerKey: string): void {
  const text = typeof turn.text === 'string' ? turn.text : '';
  console.log(JSON.stringify({
    event,
    providerKey,
    turnHash: hashRedacted(turn.turnId),
    intent: turn.intent,
    messageType: typeof turn.metadata?.messageType === 'string' ? turn.metadata.messageType : undefined,
    eventType: typeof turn.metadata?.eventType === 'string' ? turn.metadata.eventType : undefined,
    hasText: text.trim().length > 0,
    textHash: text.trim() ? hashRedacted(text) : undefined,
    hasChatTarget: Boolean(turn.target.chatId),
    hasActor: Boolean(turn.actor?.openId || turn.actor?.userId || turn.actor?.tenantKey)
  }));
}

function hashRedacted(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
