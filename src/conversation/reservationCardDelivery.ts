import { createHash } from 'node:crypto';
import type { DeliveryTarget, InboundActor, InboundTurn, JsonRecord, ProviderAction, ProviderFact, ProviderNotification } from '../core/contracts.js';
import type { ProviderCallbackForwarder, ProviderExecutionResult } from '../providers/contracts.js';
import type { PendingActionRecord, PendingStore } from '../state/pendingStore.js';

export const AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY = 'ai-conversation-reservation';
export const AI_CONVERSATION_RESERVATION_CARD_ACTION_ID = 'pms.reservation.pending_action';
export const PMS_PENDING_ACTION_CONFIRM_OPERATION = 'pms.pending_action.confirm';
export const PMS_PENDING_ACTION_CANCEL_OPERATION = 'pms.pending_action.cancel';

const CARD_CONTRACT = 'ai-conversation.reservation-confirmation-card.v1';

type PendingActionOperation = typeof PMS_PENDING_ACTION_CONFIRM_OPERATION | typeof PMS_PENDING_ACTION_CANCEL_OPERATION;

interface ConversationReservationCardReply extends JsonRecord {
  type: 'reservation_confirmation_card';
  contract: typeof CARD_CONTRACT;
  operation: 'pms.reservation.prepare_confirm';
  text: string;
  card: JsonRecord;
  pendingAction: JsonRecord;
  callback: JsonRecord;
  safety: JsonRecord;
}

export function conversationReservationCardReplies(body: JsonRecord): ConversationReservationCardReply[] {
  const replies = Array.isArray(body.replies) ? body.replies : [];
  return replies.filter(isConversationReservationCardReply);
}

export function hasConversationReservationCardReply(body: JsonRecord): boolean {
  return conversationReservationCardReplies(body).length > 0;
}

export function buildConversationReservationCardNotification(input: {
  readonly reply: ConversationReservationCardReply;
  readonly turn: InboundTurn;
  readonly pendingStore: PendingStore;
  readonly now: () => string;
}): ProviderNotification | undefined {
  const pendingAction = pendingActionFromReply(input.reply);
  if (!pendingAction) return undefined;
  const correlationId = stringField(input.reply.callback, 'correlationId') ?? `reservation-card:${hashRedacted(pendingAction.pendingActionRef)}`;
  const pendingId = `reservation-card-${hashRedacted(`${pendingAction.pendingActionRef}:${pendingAction.cardPayloadRef}`)}`;
  const pendingRecord = input.pendingStore.put({
    providerKey: AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY,
    pendingId,
    actionId: AI_CONVERSATION_RESERVATION_CARD_ACTION_ID,
    target: input.turn.target,
    payload: {
      pendingKind: 'ai-conversation-reservation-confirmation-card.v1',
      providerKey: AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY,
      actionId: AI_CONVERSATION_RESERVATION_CARD_ACTION_ID,
      correlationId,
      pendingAction: pendingAction as unknown as JsonRecord,
      callbackOwner: 'adapter-feishu',
      targetOwner: 'pms-platform',
      naturalLanguageConfirmAllowed: false,
      rawRefsVisibleToCustomerText: false
    },
    metadata: {
      pendingKind: 'ai-conversation-reservation-confirmation-card.v1',
      correlationId,
      pendingActionRefHash: hashRedacted(pendingAction.pendingActionRef),
      cardPayloadRefHash: hashRedacted(pendingAction.cardPayloadRef)
    }
  });

  return {
    providerKey: AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY,
    notificationId: `ai-conversation-reservation-card-${pendingRecord.pendingId}`,
    occurredAt: input.now(),
    title: safeCardScalar(stringField(input.reply.card, 'title')) ?? '预订确认',
    summary: safeCardScalar(stringField(input.reply.card, 'summary')) ?? 'PMS 已生成待确认的预订草稿；请人工核对后点击卡片按钮。',
    severity: 'info',
    target: input.turn.target,
    bodyMarkdown: safeCardScalar(stringField(input.reply.card, 'bodyMarkdown')) ?? '**这不是最终预订确认。**\n点击卡片按钮后才会转交 PMS pending-action 确认。',
    facts: safeFacts(input.reply.card.facts),
    actions: [reservationCardAction(pendingRecord.pendingId, correlationId, PMS_PENDING_ACTION_CONFIRM_OPERATION), reservationCardAction(pendingRecord.pendingId, correlationId, PMS_PENDING_ACTION_CANCEL_OPERATION)],
    dedupeKey: `ai-conversation-reservation-card:${pendingRecord.pendingId}`,
    rawPayload: {
      source: 'ai-conversation',
      contract: CARD_CONTRACT,
      operation: 'pms.reservation.prepare_confirm',
      pendingActionRefHash: hashRedacted(pendingAction.pendingActionRef),
      cardPayloadRefHash: hashRedacted(pendingAction.cardPayloadRef),
      rawRefsLogged: false
    },
    metadata: {
      projectionKind: 'reservationConfirmationCard',
      pendingId: pendingRecord.pendingId,
      callbackOwner: 'adapter-feishu',
      targetOwner: 'pms-platform',
      naturalLanguageConfirmAllowed: false
    }
  };
}

export function isConversationReservationCardAction(providerKey: string, actionId: string): boolean {
  return providerKey === AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY && actionId === AI_CONVERSATION_RESERVATION_CARD_ACTION_ID;
}

export async function handleConversationReservationCardAction(input: {
  readonly turn: InboundTurn;
  readonly pendingRecord: PendingActionRecord;
  readonly callbackForwarder?: ProviderCallbackForwarder;
}): Promise<ProviderExecutionResult> {
  const operation = pendingActionOperationFromCallback(input.turn.callback?.value ?? {});
  if (!operation) return failed('invalid_reservation_card_action');
  const pendingAction = pendingActionFromRecord(recordField(input.pendingRecord.payload, 'pendingAction'));
  if (!pendingAction) return failed('missing_reservation_pending_action');
  if (!input.callbackForwarder) return failed('reservation_pending_action_callback_forwarder_required');

  const correlationId = stringField(input.turn.callback?.value, 'correlationId')
    ?? stringField(input.pendingRecord.payload, 'correlationId')
    ?? `reservation-card:${input.pendingRecord.pendingId}`;
  const requestedAt = input.turn.receivedAt;
  const request: JsonRecord = {
    operation,
    pendingActionRef: pendingAction.pendingActionRef,
    actor: actorFromTurn(input.turn.actor),
    scope: pendingActionScope(input.turn, input.pendingRecord.target, pendingAction.propertyId),
    clientToken: `${operation}:${input.pendingRecord.pendingId}`,
    requestFingerprint: `fingerprint:${operation}:${input.pendingRecord.pendingId}`,
    correlationId,
    requestedAt,
    cardPayloadRef: pendingAction.cardPayloadRef,
    ...(operation === PMS_PENDING_ACTION_CANCEL_OPERATION ? { reason: '用户点击飞书预订确认卡片取消按钮。' } : {})
  };
  const forwardResult = await input.callbackForwarder.forwardCallback({
    envelope: {
      contract: {
        name: 'pms-platform-pending-action-callback',
        version: 'v1',
        owner: 'pms-platform',
        status: 'adapter-runtime-forward'
      },
      source: 'adapter-feishu',
      reason: 'adapter-feishu validated a reservation typed-card action from ai-conversation delivery.',
      correlationId,
      requestedAt,
      platformPendingAction: {
        operation,
        request,
        routing: {
          owner: 'pms-platform',
          endpoints: {
            confirm: '/v1/pms/pending-actions/confirm',
            cancel: '/v1/pms/pending-actions/cancel',
            status: '/v1/pms/pending-actions/status'
          }
        }
      },
      orchestrator: {
        providerKey: AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY,
        pendingId: input.pendingRecord.pendingId,
        actionId: AI_CONVERSATION_RESERVATION_CARD_ACTION_ID,
        callbackOwner: 'adapter-feishu',
        targetOwner: 'pms-platform',
        naturalLanguageConfirmAllowed: false
      }
    },
    metadata: {
      providerKey: AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY,
      pendingId: input.pendingRecord.pendingId,
      actionId: AI_CONVERSATION_RESERVATION_CARD_ACTION_ID,
      operation,
      rawRefsLogged: false
    }
  });

  return {
    providerKey: AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY,
    status: 'accepted',
    message: 'reservation_pending_action_callback_forwarded',
    rawResponse: {
      statusCode: forwardResult.statusCode,
      body: forwardResult.body ?? {}
    },
    metadata: {
      pendingId: input.pendingRecord.pendingId,
      actionId: AI_CONVERSATION_RESERVATION_CARD_ACTION_ID,
      operation,
      correlationId
    }
  };
}

function reservationCardAction(pendingId: string, correlationId: string, operation: PendingActionOperation): ProviderAction {
  return {
    actionId: AI_CONVERSATION_RESERVATION_CARD_ACTION_ID,
    label: operation === PMS_PENDING_ACTION_CONFIRM_OPERATION ? '确认预订' : '取消',
    style: operation === PMS_PENDING_ACTION_CONFIRM_OPERATION ? 'primary' : 'danger',
    payload: {
      providerKey: AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY,
      pendingId,
      actionId: AI_CONVERSATION_RESERVATION_CARD_ACTION_ID,
      operation,
      correlationId
    }
  };
}

function pendingActionOperationFromCallback(value: JsonRecord): PendingActionOperation | undefined {
  const operation = stringField(value, 'operation');
  return operation === PMS_PENDING_ACTION_CONFIRM_OPERATION || operation === PMS_PENDING_ACTION_CANCEL_OPERATION ? operation : undefined;
}

function pendingActionFromReply(reply: ConversationReservationCardReply): PendingActionRef | undefined {
  const pendingAction = pendingActionFromRecord(reply.pendingAction);
  if (!pendingAction) return undefined;
  if (stringField(reply.pendingAction, 'status') !== 'awaitingConfirmation') return undefined;
  if (stringField(reply.pendingAction, 'confirmationMode') !== 'typedCardOnly') return undefined;
  if (stringField(reply.pendingAction, 'mutationStatus') !== 'none') return undefined;
  if (!acceptedCallbackBoundary(reply.callback)) return undefined;
  if (!acceptedSafetyBoundary(reply.safety)) return undefined;
  return pendingAction;
}

interface PendingActionRef {
  pendingActionRef: string;
  cardPayloadRef: string;
  quoteRef: string;
  propertyId: string;
}

function pendingActionFromRecord(record: JsonRecord | undefined): PendingActionRef | undefined {
  const pendingActionRef = stringField(record, 'pendingActionRef');
  const cardPayloadRef = stringField(record, 'cardPayloadRef');
  const quoteRef = stringField(record, 'quoteRef');
  const propertyId = stringField(record, 'propertyId') ?? 'default';
  if (!pendingActionRef || !cardPayloadRef || !quoteRef) return undefined;
  return { pendingActionRef, cardPayloadRef, quoteRef, propertyId };
}

function pendingActionScope(turn: InboundTurn, target: DeliveryTarget | undefined, propertyId: string): JsonRecord {
  return {
    propertyId,
    channel: 'typed_card',
    ...(turn.actor?.tenantKey ? { tenantIdHash: hashRedacted(turn.actor.tenantKey) } : {}),
    ...(target?.chatId ?? turn.target.chatId ? { chatIdHash: hashRedacted(target?.chatId ?? turn.target.chatId ?? '') } : {}),
    ...(turn.actor?.userId || turn.actor?.openId ? { userIdHash: hashRedacted(turn.actor.userId ?? turn.actor.openId ?? '') } : {})
  };
}

function actorFromTurn(actor: InboundActor | undefined): JsonRecord {
  const id = actor?.userId ?? actor?.openId ?? actor?.tenantKey ?? 'unknown-feishu-actor';
  return {
    type: 'human',
    id,
    ...(actor?.displayName ? { displayName: actor.displayName } : {})
  };
}

function safeFacts(value: unknown): ProviderFact[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => isRecord(item) ? { label: safeCardScalar(stringField(item, 'label')), value: safeCardScalar(stringField(item, 'value')) } : undefined)
    .filter((item): item is ProviderFact => Boolean(item?.label && item.value))
    .slice(0, 8);
}

function safeCardScalar(value: string | undefined): string | undefined {
  const text = value?.trim();
  if (!text || rawRefOrSecretPattern.test(text)) return undefined;
  return text.slice(0, 200);
}

function failed(message: string): ProviderExecutionResult {
  return {
    providerKey: AI_CONVERSATION_RESERVATION_CARD_PROVIDER_KEY,
    status: 'failed',
    message
  };
}

function recordField(record: JsonRecord | undefined, key: string): JsonRecord | undefined {
  const value = record?.[key];
  return isRecord(value) ? value : undefined;
}

function stringField(record: JsonRecord | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isConversationReservationCardReply(value: unknown): value is ConversationReservationCardReply {
  if (!isRecord(value)) return false;
  if (value.type !== 'reservation_confirmation_card'
    || value.contract !== CARD_CONTRACT
    || value.operation !== 'pms.reservation.prepare_confirm'
    || !isRecord(value.card)
    || !isRecord(value.pendingAction)
    || !isRecord(value.callback)
    || !isRecord(value.safety)) {
    return false;
  }
  return Boolean(pendingActionFromReply(value as ConversationReservationCardReply));
}

function acceptedCallbackBoundary(callback: JsonRecord): boolean {
  return stringField(callback, 'owner') === 'adapter-feishu'
    && stringField(callback, 'targetOwner') === 'pms-platform'
    && stringField(callback, 'confirmOperation') === PMS_PENDING_ACTION_CONFIRM_OPERATION
    && stringField(callback, 'cancelOperation') === PMS_PENDING_ACTION_CANCEL_OPERATION
    && callback.naturalLanguageConfirmAllowed === false;
}

function acceptedSafetyBoundary(safety: JsonRecord): boolean {
  return safety.customerTextContainsRawRefs === false
    && safety.durableAiConversationMemoryAllowed === false
    && safety.rawRefsConfinedToAdapterCallbackBoundary === true;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hashRedacted(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

const rawRefOrSecretPattern = /https?:\/\/|token|secret|draft(?:Id|Ref)|quoteRef|pendingActionRef|cardPayloadRef|bearer/i;
