import type { DeliveryTarget, InboundTurn, JsonRecord } from '../../core/contracts.js';

export type FeishuReceiveIdType = 'chat_id' | 'open_id';

export interface FeishuMessageTarget {
  receiveIdType: FeishuReceiveIdType;
  receiveId: string;
  threadId?: string;
}

export interface FeishuHeader {
  event_id?: string;
  event_type?: string;
}

export interface FeishuSender {
  sender_id?: {
    open_id?: string;
    union_id?: string;
    user_id?: string;
  };
}

export interface FeishuMessage {
  message_id?: string;
  chat_id?: string;
  message_type?: string;
  content?: string;
}

export interface FeishuEventEnvelope {
  type?: string;
  challenge?: string;
  token?: string;
  header?: FeishuHeader;
  event?: {
    sender?: FeishuSender;
    message?: FeishuMessage;
  };
  [key: string]: unknown;
}

export type FeishuTurnHandler = (
  turn: InboundTurn,
  context: { source: 'webhook' | 'long_connection'; rawEvent: FeishuEventEnvelope }
) => Promise<void>;

export interface FeishuClientSendResult {
  messageId?: string;
}

export type FeishuMessageSendClient = {
  sendText(target: DeliveryTarget, text: string): Promise<FeishuClientSendResult>;
  sendCard(target: DeliveryTarget, card: Record<string, unknown>): Promise<FeishuClientSendResult>;
};

export function resolveFeishuMessageTarget(target: DeliveryTarget): FeishuMessageTarget {
  if (target.openId) {
    return {
      receiveIdType: 'open_id',
      receiveId: target.openId,
      threadId: target.threadId
    };
  }

  if (target.chatId) {
    return {
      receiveIdType: 'chat_id',
      receiveId: target.chatId,
      threadId: target.threadId
    };
  }

  throw new Error('Feishu target must include either openId or chatId');
}

export function normalizeFeishuMessageEvent(raw: FeishuEventEnvelope): InboundTurn | null {
  if (raw.header?.event_type !== 'im.message.receive_v1') {
    return null;
  }

  const message = raw.event?.message;
  const sender = raw.event?.sender?.sender_id;
  const receivedAt = new Date().toISOString();
  const text = extractText(message?.content, message?.message_type);
  const turnId = message?.message_id ?? raw.header?.event_id ?? `feishu-${receivedAt}`;

  return {
    turnId,
    channel: 'feishu',
    intent: 'command',
    receivedAt,
    actor: {
      openId: sender?.open_id,
      userId: sender?.user_id,
      tenantKey: sender?.union_id
    },
    target: {
      channel: 'feishu',
      chatId: message?.chat_id,
      messageId: message?.message_id,
      threadId: message?.chat_id
    },
    text,
    rawEvent: toJsonRecord(raw),
    metadata: {
      eventType: raw.header?.event_type ?? 'unknown',
      messageType: message?.message_type ?? 'unknown',
      eventId: raw.header?.event_id ?? turnId
    }
  };
}

function extractText(content: string | undefined, messageType: string | undefined): string {
  if (!content) {
    return '';
  }

  try {
    const parsed = JSON.parse(content) as { text?: string };
    if (messageType === 'text' && typeof parsed.text === 'string') {
      return parsed.text;
    }
  } catch {
    return content;
  }

  return content;
}

function toJsonRecord(value: unknown): JsonRecord {
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}
