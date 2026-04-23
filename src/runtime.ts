import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createFeishuClient, type FeishuClient } from './channels/feishu/client.js';
import {
  createLongConnectionIngress,
  type LongConnectionConfig,
  type LongConnectionDeps,
  type LongConnectionIngress
} from './channels/feishu/longConnection.js';
import { createReplySink, type ReplySink } from './channels/feishu/replySink.js';
import { type DispatchRequest, dispatchWebhookRequest } from './channels/feishu/webhook.js';
import { readRequestBody, respondJson } from './channels/feishu/webhookSecurity.js';
import type { AdapterConfig } from './config.js';
import { type JsonRecord } from './core/contracts.js';
import {
  createProviderRegistry,
  registerProvider,
  type ProviderRegistry
} from './providers/registry.js';
import { createProviderRouter, type ProviderRouter } from './providers/router.js';
import {
  WARNING_AGENT_PROVIDER_KEY,
  createWarningAgentProvider,
  getWarningAgentDedupeKey,
  isWarningAgentNotificationPayload
} from './providers/warning-agent/index.js';
import { dispatchCardActionRequest } from './server/cardAction.js';
import { dispatchAdapterHttpRequest, type AdapterHttpRequest, type AdapterHttpResponse } from './server/httpHost.js';
import { dispatchProviderWebhookRequest } from './server/providerWebhook.js';
import { createAlertDeduper, type AlertDeduper } from './state/dedupe.js';
import { createPendingStore, type PendingStore } from './state/pendingStore.js';

export interface AdapterRuntime {
  providerRegistry: ProviderRegistry;
  providerRouter: ProviderRouter;
  deduper: AlertDeduper;
  pendingStore: PendingStore;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface AdapterHttpServer {
  listen(): Promise<void>;
  close(): Promise<void>;
}

export interface AdapterRuntimeDeps {
  createClient(config: { appId: string; appSecret: string }): FeishuClient;
  createReplySink(client: FeishuClient): ReplySink;
  createLongConnectionIngress(config: LongConnectionConfig, handleTurn: Parameters<typeof createLongConnectionIngress>[1], deps?: LongConnectionDeps): LongConnectionIngress;
  createHttpServer(
    config: { host: string; port: number },
    handleRequest: (request: AdapterHttpRequest) => Promise<AdapterHttpResponse>
  ): AdapterHttpServer;
}

const defaultDeps: AdapterRuntimeDeps = {
  createClient(config) {
    return createFeishuClient(config);
  },
  createReplySink(client) {
    return createReplySink(client);
  },
  createLongConnectionIngress(config, handleTurn) {
    return createLongConnectionIngress(config, handleTurn);
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
  const client = deps.createClient({
    appId: config.feishu.appId,
    appSecret: config.feishu.appSecret
  });
  const replySink = deps.createReplySink(client);

  const providerRegistry = createProviderRegistry({
    allowedProviderKeys: config.providers.keys,
    defaultProviderKey: config.providers.defaultProvider
  });

  if (config.providers.keys.includes(WARNING_AGENT_PROVIDER_KEY)) {
    registerProvider(providerRegistry, createWarningAgentProvider());
  }

  const providerRouter = createProviderRouter(providerRegistry, {
    defaultProviderKey: config.providers.defaultProvider,
    allowProviderOverride: config.providers.allowProviderOverride
  });
  const deduper = createAlertDeduper({
    ttlMs: config.state.dedupeTtlSeconds * 1000
  });
  const pendingStore = createPendingStore({
    ttlMs: config.state.pendingTtlSeconds * 1000
  });
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

    if (turn.intent === 'callback' && provider.handleCallback) {
      await provider.handleCallback(turn, {
        replySink,
        defaultTarget: turn.target,
        now
      });
    }
  };

  const longConnectionIngress = deps.createLongConnectionIngress(
    {
      appId: config.feishu.appId,
      appSecret: config.feishu.appSecret
    },
    handleTurn
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
            now
          });
        },
        handleCardAction(requestBody) {
          return dispatchCardActionRequest(requestBody, {
            providerRouter,
            pendingStore,
            replySink,
            now
          });
        }
      });
    }
  );

  return {
    providerRegistry,
    providerRouter,
    deduper,
    pendingStore,
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
