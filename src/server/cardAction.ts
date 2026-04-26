import type { DeliveryTarget, InboundTurn, JsonRecord } from '../core/contracts.js';
import type { ProviderCallbackForwarder, ProviderNotificationSink } from '../providers/contracts.js';
import type { ProviderRouter } from '../providers/router.js';
import type { PendingStore } from '../state/pendingStore.js';

export interface CardActionRequest {
  method?: string;
  pathname?: string;
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
}

export async function dispatchCardActionRequest(
  request: CardActionRequest,
  deps: CardActionDispatchDeps
): Promise<CardActionResponse> {
  const pathname = request.pathname ?? '/providers/card-action';
  if (pathname !== '/card-action' && pathname !== '/providers/card-action') {
    return { statusCode: 404, body: { code: 404, message: 'not_found' } };
  }

  if (request.method !== 'POST') {
    return { statusCode: 405, body: { code: 405, message: 'method_not_allowed' } };
  }

  const payload = parseJsonRecord(request.rawBody);
  if (!payload) {
    return { statusCode: 400, body: { code: 400, message: 'invalid_json' } };
  }

  const actionValue = extractActionValue(payload);
  const providerKey = stringField(actionValue, 'providerKey');
  const pendingId = stringField(actionValue, 'pendingId');
  const actionId = stringField(actionValue, 'actionId');
  if (!providerKey || !pendingId || !actionId) {
    return { statusCode: 400, body: { code: 400, message: 'invalid_action_payload' } };
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
    target: target ?? {
      channel: 'feishu',
      messageId: openMessageId(payload)
    },
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
  const operator = recordField(payload, 'operator') ?? recordField(payload, 'user') ?? recordField(event, 'operator');
  if (!operator) {
    return undefined;
  }
  const openId = stringField(operator, 'open_id') ?? stringField(operator, 'openId');
  const userId = stringField(operator, 'user_id') ?? stringField(operator, 'userId');
  const tenantKey = stringField(operator, 'tenant_key') ?? stringField(operator, 'tenantKey') ?? stringField(operator, 'union_id');
  const displayName = stringField(operator, 'name') ?? stringField(operator, 'displayName');
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

function openMessageId(payload: JsonRecord): string | undefined {
  const event = recordField(payload, 'event');
  const context = recordField(payload, 'context') ?? recordField(event, 'context');
  return stringField(payload, 'open_message_id') ?? stringField(context ?? {}, 'open_message_id');
}

function extractActionValue(payload: JsonRecord): JsonRecord {
  const event = recordField(payload, 'event');
  const action = recordField(payload, 'action') ?? recordField(event, 'action');
  const actionValue = action ? recordField(action, 'value') : undefined;
  return actionValue ?? {};
}

function recordField(value: JsonRecord | undefined, key: string): JsonRecord | undefined {
  const candidate = value?.[key];
  return isRecord(candidate) ? (candidate as JsonRecord) : undefined;
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
  return typeof value === 'object' && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown_error';
}
