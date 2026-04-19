import type { AdapterConfig } from './config.js';
import type { InboundTurn } from './core/contracts.js';
import { createFeishuClient, type FeishuClient } from './channels/feishu/client.js';
import {
  createLongConnectionIngress,
  type LongConnectionConfig,
  type LongConnectionDeps,
  type LongConnectionIngress
} from './channels/feishu/longConnection.js';
import { createReplySink, type ReplySink } from './channels/feishu/replySink.js';
import {
  createWebhookServer,
  type WebhookServer,
  type WebhookServerConfig
} from './channels/feishu/webhook.js';
import type { FeishuTurnHandler } from './channels/feishu/types.js';
import type { ProviderRegistry } from './providers/registry.js';
import { createProviderRouter, type ProviderRouteResolution, type ProviderRouter } from './providers/router.js';

export interface FeishuChannelApp {
  mode: AdapterConfig['feishu']['ingressMode'];
  client: FeishuClient;
  replySink: ReplySink;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface FeishuChannelAppDeps {
  createClient(config: { appId: string; appSecret: string }): FeishuClient;
  createReplySink(client: FeishuClient): ReplySink;
  createWebhookServer(config: WebhookServerConfig, handleTurn: FeishuTurnHandler): WebhookServer;
  createLongConnectionIngress(config: LongConnectionConfig, handleTurn: FeishuTurnHandler, deps?: LongConnectionDeps): LongConnectionIngress;
}

export interface ResolvedProviderTurn {
  turn: InboundTurn;
  resolution: ProviderRouteResolution;
}

export type ResolvedTurnHandler = (
  resolvedTurn: ResolvedProviderTurn,
  context: Parameters<FeishuTurnHandler>[1]
) => Promise<void>;

export interface AdapterApp extends FeishuChannelApp {
  providerRegistry: ProviderRegistry;
  providerRouter: ProviderRouter;
}

const defaultDeps: FeishuChannelAppDeps = {
  createClient(config) {
    return createFeishuClient(config);
  },
  createReplySink(client) {
    return createReplySink(client);
  },
  createWebhookServer(config, handleTurn) {
    return createWebhookServer(config, handleTurn);
  },
  createLongConnectionIngress(config, handleTurn) {
    return createLongConnectionIngress(config, handleTurn);
  }
};

export function createFeishuChannelApp(
  config: AdapterConfig,
  handleTurn: FeishuTurnHandler,
  deps: FeishuChannelAppDeps = defaultDeps
): FeishuChannelApp {
  const client = deps.createClient({
    appId: config.feishu.appId,
    appSecret: config.feishu.appSecret
  });
  const replySink = deps.createReplySink(client);

  if (config.feishu.ingressMode === 'webhook') {
    const webhookServer = deps.createWebhookServer(
      {
        host: config.service.host,
        port: config.service.port,
        verificationToken: config.feishu.verificationToken,
        secret: config.feishu.webhookSecret
      },
      handleTurn
    );

    return {
      mode: 'webhook',
      client,
      replySink,
      async start() {
        await webhookServer.listen();
      },
      async stop() {
        await webhookServer.close();
      }
    };
  }

  const longConnectionIngress = deps.createLongConnectionIngress(
    {
      appId: config.feishu.appId,
      appSecret: config.feishu.appSecret
    },
    handleTurn
  );

  return {
    mode: 'long_connection',
    client,
    replySink,
    async start() {
      await longConnectionIngress.start();
    },
    async stop() {
      await longConnectionIngress.stop();
    }
  };
}

export function createProviderTurnHandler(
  providerRouter: ProviderRouter,
  handleResolvedTurn: ResolvedTurnHandler
): FeishuTurnHandler {
  return async (turn, context) => {
    const resolution = providerRouter.resolve(turn);
    await handleResolvedTurn(
      {
        turn,
        resolution
      },
      context
    );
  };
}

export function createAdapterApp(
  config: AdapterConfig,
  providerRegistry: ProviderRegistry,
  handleResolvedTurn: ResolvedTurnHandler,
  deps: FeishuChannelAppDeps = defaultDeps
): AdapterApp {
  const providerRouter = createProviderRouter(providerRegistry, {
    defaultProviderKey: config.providers.defaultProvider,
    allowProviderOverride: config.providers.allowProviderOverride
  });
  const channelApp = createFeishuChannelApp(
    config,
    createProviderTurnHandler(providerRouter, handleResolvedTurn),
    deps
  );

  return {
    ...channelApp,
    providerRegistry,
    providerRouter
  };
}
