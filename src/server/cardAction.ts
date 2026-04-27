import type { IncomingHttpHeaders } from 'node:http';
import type { DeliveryTarget, InboundTurn, JsonRecord } from '../core/contracts.js';
import type { ProviderCallbackForwarder, ProviderNotificationSink } from '../providers/contracts.js';
import type { ProviderRouter } from '../providers/router.js';
import type { PendingStore } from '../state/pendingStore.js';

const CARD_ACTION_PATHS = new Set(['/card-action', '/providers/card-action', '/webhook/card']);

export interface CardActionRequest {
  method?: string;
  pathname?: string;
  headers?: IncomingHttpHeaders;
  rawBody: string;
}

export interface CardActionResponse {
  statusCode: number;
  body: Record<string, unknown>;
}

export interface CardActionDispatchDeps {
  providerRouter: ProviderRouter;
  pendingStore: PendingStore;
  replySink: ProviderNotificationSink;
  defaultTarget?: DeliveryTarget;
  now?: () => string;
  callbackForwarder?: ProviderCallbackForwarder;
  verificationToken?: string;
}

export async function dispatchCardActionRequest(
  request: CardActionRequest,
  deps: CardActionDispatchDeps
): Promise<CardActionResponse> {
  const pathname = request.pathname ?? '/providers/card-action';
  if (!CARD_ACTION_PATHS.has(pathname)) {
    return { statusCode: 404, body: { code: 404, message: 'not_found' } };
  }

  if (request.method !== 'POST') {
    return { statusCode: 405, body: { code: 405, message: 'method_not_allowed' } };
  }

  const payload = parseJsonRecord(request.rawBody);
  if (!payload) {
    return { statusCode: 400, body: { code: 400, message: 'invalid_json' } };
  }

  if (!verifyCardActionToken(payload, deps.verificationToken)) {
    return {
      statusCode: 401,
      body: {
        code: 401,
        message: 'invalid_card_action_token',
        blocker: 'adapter_card_action_ingress_invalid'
      }
    };
  }

  const actionValue = extractActionValue(payload);
  const providerKey = stringField(actionValue, 'providerKey');
  const pendingId = stringField(actionValue, 'pendingId');
  const actionId = stringField(actionValue, 'actionId');
  if (!providerKey || !pendingId || !actionId) {
    return {
      statusCode: 400,
      body: {
        code: 400,
        message: 'invalid_action_payload',
        blocker: 'adapter_card_action_ingress_invalid'
      }
    };
  }

  const pendingRecord = deps.pendingStore.get(providerKey, pendingId);
  if (!pendingRecord) {
    return { statusCode: 404, body: { code: 404, message: 'pending_not_found' } };
  }

  if (pendingRecord.actionId !== actionId) {
    return { statusCode: 409, body: { code: 409, message: 'action_mismatch' } };
  }

  const resolution = deps.providerRouter.resolve({ providerKey });
  const provider = resolution.provider.definition;
  if (!provider.handleCallback) {
    return { statusCode: 501, body: { code: 501, message: 'callback_not_supported' } };
  }

  const callbackTurn = buildCallbackTurn(payload, actionValue, pendingRecord.target, deps.now, providerKey);
  const result = await provider.handleCallback(callbackTurn, {
    replySink: deps.replySink,
    defaultTarget: pendingRecord.target ?? deps.defaultTarget,
    now: deps.now,
    pendingStore: deps.pendingStore,
    callbackForwarder: deps.callbackForwarder
  }).catch((error: unknown) => ({ error }));

  if ('error' in result) {
    return {
      statusCode: 502,
      body: {
        code: 502,
        providerKey,
        message: 'callback_forward_failed',
        error: errorMessage(result.error)
      }
    };
  }

  if (result.status === 'failed') {
    return {
      statusCode: 409,
      body: {
        code: 409,
        providerKey,
        message: result.message ?? 'callback_rejected'
      }
    };
  }

  deps.pendingStore.consume(providerKey, pendingId);

  return {
    statusCode: 200,
    body: {
      code: 0,
      providerKey,
      status: result.status
    }
  };
}

function buildCallbackTurn(
  payload: JsonRecord,
  actionValue: JsonRecord,
  target: DeliveryTarget | undefined,
  now: (() => string) | undefined,
  providerKey: string
): InboundTurn {
  const receivedAt = now?.() ?? new Date().toISOString();

  return {
    turnId: `card-action-${stringField(actionValue, 'pendingId') ?? receivedAt}`,
    channel: 'feishu',
    intent: 'callback',
    receivedAt,
    providerKey,
    actor: actorFromPayload(payload),
    target: target ?? fallbackTargetFromPayload(payload),
    callback: {
      actionId: stringField(actionValue, 'actionId') ?? 'unknown-action',
      value: actionValue
    },
    rawEvent: payload,
    metadata: {
      openMessageId: openMessageId(payload) ?? '',
      pendingId: stringField(actionValue, 'pendingId') ?? ''
    }
  };
}

function actorFromPayload(payload: JsonRecord): InboundTurn['actor'] | undefined {
  const event = recordField(payload, 'event');
  const candidates = [
    recordField(payload, 'operator'),
    recordField(payload, 'user'),
    recordField(event, 'operator'),
    recordField(event, 'user'),
    event,
    payload
  ];

  for (const candidate of candidates) {
    const actor = candidate ? actorFromRecord(candidate) : undefined;
    if (actor) {
      return actor;
    }
  }

  return undefined;
}

function actorFromRecord(record: JsonRecord): InboundTurn['actor'] | undefined {
  const operatorId = recordField(record, 'operator_id') ?? recordField(record, 'operatorId');
  const openId =
    stringField(record, 'open_id') ?? stringField(record, 'openId') ?? stringField(operatorId ?? {}, 'open_id');
  const userId =
    stringField(record, 'user_id') ?? stringField(record, 'userId') ?? stringField(operatorId ?? {}, 'user_id');
  const tenantKey =
    stringField(record, 'tenant_key') ??
    stringField(record, 'tenantKey') ??
    stringField(record, 'union_id') ??
    stringField(operatorId ?? {}, 'union_id');
  const displayName = stringField(record, 'name') ?? stringField(record, 'displayName');
  if (!openId && !userId && !tenantKey && !displayName) {
    return undefined;
  }
  return {
    openId,
    userId,
    tenantKey,
    displayName
  };
}

function fallbackTargetFromPayload(payload: JsonRecord): DeliveryTarget {
  return {
    channel: 'feishu',
    chatId: openChatId(payload),
    messageId: openMessageId(payload)
  };
}

function openMessageId(payload: JsonRecord): string | undefined {
  const event = recordField(payload, 'event');
  const context = recordField(payload, 'context') ?? recordField(event, 'context');
  return (
    stringField(payload, 'open_message_id') ??
    stringField(event ?? {}, 'open_message_id') ??
    stringField(context ?? {}, 'open_message_id')
  );
}

function openChatId(payload: JsonRecord): string | undefined {
  const event = recordField(payload, 'event');
  const context = recordField(payload, 'context') ?? recordField(event, 'context');
  return (
    stringField(payload, 'open_chat_id') ??
    stringField(event ?? {}, 'open_chat_id') ??
    stringField(context ?? {}, 'open_chat_id')
  );
}

function extractActionValue(payload: JsonRecord): JsonRecord {
  const event = recordField(payload, 'event');
  const action = recordField(payload, 'action') ?? recordField(event, 'action');
  const actionValue = action ? recordOrJsonStringField(action, 'value') : undefined;
  if (actionValue) {
    return actionValue;
  }

  const directValue = recordOrJsonStringField(payload, 'value') ?? recordOrJsonStringField(event, 'value');
  if (directValue) {
    return directValue;
  }

  if (action && stringField(action, 'providerKey') && stringField(action, 'pendingId')) {
    return action;
  }

  return {};
}

function verifyCardActionToken(payload: JsonRecord, expected: string | undefined): boolean {
  if (!expected) {
    return true;
  }
  return cardActionToken(payload) === expected;
}

function cardActionToken(payload: JsonRecord): string | undefined {
  const header = recordField(payload, 'header');
  const event = recordField(payload, 'event');
  return stringField(payload, 'token') ?? stringField(event ?? {}, 'token') ?? stringField(header ?? {}, 'token');
}

function recordField(value: JsonRecord | undefined, key: string): JsonRecord | undefined {
  const candidate = value?.[key];
  return isRecord(candidate) ? (candidate as JsonRecord) : undefined;
}

function recordOrJsonStringField(value: JsonRecord | undefined, key: string): JsonRecord | undefined {
  const candidate = value?.[key];
  if (isRecord(candidate)) {
    return candidate as JsonRecord;
  }
  if (typeof candidate !== 'string' || !candidate.trim()) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(candidate) as unknown;
    return isRecord(parsed) ? (parsed as JsonRecord) : undefined;
  } catch {
    return undefined;
  }
}

function stringField(value: JsonRecord, key: string): string | undefined {
  const candidate = value[key];
  return typeof candidate === 'string' && candidate.trim() ? candidate : undefined;
}

function parseJsonRecord(rawBody: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return isRecord(parsed) ? (parsed as JsonRecord) : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown_error';
}
