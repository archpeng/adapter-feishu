import * as Lark from '@larksuiteoapi/node-sdk';
import { normalizeFeishuMessageEvent, type FeishuEventEnvelope, type FeishuTurnHandler } from './types.js';

export interface LongConnectionConfig {
  appId: string;
  appSecret: string;
}

type EventDispatcherLike = {
  register(handlers: Record<string, (data: Record<string, unknown>) => Promise<void>>): EventDispatcherLike;
};

type WsClientLike = {
  start(options: { eventDispatcher: EventDispatcherLike }): void | Promise<void>;
  stop?: () => void | Promise<void>;
};

export interface LongConnectionDeps {
  createWsClient(config: LongConnectionConfig): WsClientLike;
  createEventDispatcher(): EventDispatcherLike;
}

export interface LongConnectionIngress {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createLongConnectionIngress(
  config: LongConnectionConfig,
  handleTurn: FeishuTurnHandler,
  deps: LongConnectionDeps = defaultDeps
): LongConnectionIngress {
  const eventDispatcher = deps.createEventDispatcher().register({
    'im.message.receive_v1': async (data) => {
      const rawEvent = toRawMessageEvent(data);
      const turn = normalizeFeishuMessageEvent(rawEvent);
      if (!turn) {
        return;
      }

      await handleTurn(turn, {
        source: 'long_connection',
        rawEvent
      });
    }
  });
  const wsClient = deps.createWsClient(config);

  return {
    async start() {
      await Promise.resolve(wsClient.start({ eventDispatcher }));
    },
    async stop() {
      if (typeof wsClient.stop === 'function') {
        await Promise.resolve(wsClient.stop());
      }
    }
  };
}

const defaultDeps: LongConnectionDeps = {
  createWsClient(config) {
    return new Lark.WSClient({
      appId: config.appId,
      appSecret: config.appSecret,
      domain: Lark.Domain.Feishu,
      loggerLevel: Lark.LoggerLevel.info
    });
  },
  createEventDispatcher() {
    return new Lark.EventDispatcher({}) as unknown as EventDispatcherLike;
  }
};

function toRawMessageEvent(data: Record<string, unknown>): FeishuEventEnvelope {
  const message = isRecord(data.message) ? data.message : {};
  const eventId =
    getString(message, 'message_id') ?? getString(message, 'root_id') ?? `lc-${Date.now().toString(36)}`;

  return {
    schema: '2.0',
    header: {
      event_id: eventId,
      event_type: 'im.message.receive_v1'
    },
    event: data as FeishuEventEnvelope['event']
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getString(value: Record<string, unknown>, key: string): string | undefined {
  const target = value[key];
  return typeof target === 'string' && target.trim() ? target : undefined;
}
