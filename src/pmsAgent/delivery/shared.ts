import { createHash } from 'node:crypto';
import type { DeliveryTarget, InboundTurn, JsonRecord, ProviderNotification } from '../../core/contracts.js';
import type { ProviderExecutionResult } from '../../providers/contracts.js';
import type { PendingActionRecord } from '../../state/pendingStore.js';
import {
  PMS_AGENT_PENDING_ACTION_ID,
  PMS_AGENT_PENDING_ACTION_PROVIDER_KEY,
  PMS_AGENT_PROVIDER_KEY,
  type PmsApprovalCard
} from '../contracts.js';

export const PMS_AGENT_CONFIRM_OPERATION = 'pms.pending_action.confirm';
export const PMS_AGENT_CANCEL_OPERATION = 'pms.pending_action.cancel';

export type PmsAgentOperation = typeof PMS_AGENT_CONFIRM_OPERATION | typeof PMS_AGENT_CANCEL_OPERATION;

export interface PmsAgentPlatformPendingActionRef {
  pendingActionRef: string;
  cardPayloadRef: string;
  quoteRef?: string;
  propertyId: string;
}

export function isPmsAgentPendingAction(providerKey: string, actionId: string): boolean {
  return providerKey === PMS_AGENT_PENDING_ACTION_PROVIDER_KEY && actionId === PMS_AGENT_PENDING_ACTION_ID;
}

export function baseNotification(input: {
  readonly turn: InboundTurn;
  readonly now: () => string;
}, notification: Omit<ProviderNotification, 'providerKey' | 'occurredAt' | 'target'>): ProviderNotification {
  return {
    providerKey: PMS_AGENT_PROVIDER_KEY,
    occurredAt: input.now(),
    target: input.turn.target,
    ...notification
  };
}

export function terminalTarget(turn: InboundTurn, pendingRecord: PendingActionRecord): DeliveryTarget {
  const callbackMessageId = stringField(turn.metadata, 'openMessageId');
  return {
    ...(pendingRecord.target ?? turn.target),
    ...(callbackMessageId || turn.target.messageId ? { messageId: callbackMessageId ?? turn.target.messageId } : {})
  };
}

export function operationFromCallback(value: JsonRecord): PmsAgentOperation | undefined {
  const operation = stringField(value, 'operation');
  return operation === PMS_AGENT_CONFIRM_OPERATION || operation === PMS_AGENT_CANCEL_OPERATION ? operation : undefined;
}

export function pendingActionFromRef(ref: PmsApprovalCard['ref']): PmsAgentPlatformPendingActionRef | undefined {
  const pendingActionRef = nonEmpty(ref.pendingActionRef) ?? nonEmpty(ref.pendingActionId);
  const cardPayloadRef = nonEmpty(ref.cardPayloadRef);
  const quoteRef = nonEmpty(ref.quoteRef);
  const propertyId = nonEmpty(ref.propertyId) ?? 'property-small-hotel';
  if (!pendingActionRef || !cardPayloadRef) return undefined;
  return {
    pendingActionRef,
    cardPayloadRef,
    ...(quoteRef ? { quoteRef } : {}),
    propertyId
  };
}

export function pendingActionFromRecord(record: JsonRecord | undefined): PmsAgentPlatformPendingActionRef | undefined {
  const pendingActionRef = stringField(record, 'pendingActionRef') ?? stringField(record, 'pendingActionId');
  const cardPayloadRef = stringField(record, 'cardPayloadRef');
  const quoteRef = stringField(record, 'quoteRef');
  const propertyId = stringField(record, 'propertyId') ?? 'property-small-hotel';
  if (!pendingActionRef || !cardPayloadRef) return undefined;
  return {
    pendingActionRef,
    cardPayloadRef,
    ...(quoteRef ? { quoteRef } : {}),
    propertyId
  };
}

export function pendingActionToRecord(pendingAction: PmsAgentPlatformPendingActionRef): JsonRecord {
  return {
    pendingActionRef: pendingAction.pendingActionRef,
    propertyId: pendingAction.propertyId,
    cardPayloadRef: pendingAction.cardPayloadRef,
    ...(pendingAction.quoteRef ? { quoteRef: pendingAction.quoteRef } : {})
  };
}

export function pendingActionScope(turn: InboundTurn, target: DeliveryTarget | undefined, propertyId: string): JsonRecord {
  return {
    propertyId,
    channel: 'typed_card',
    ...(turn.actor?.tenantKey ? { tenantIdHash: hashRedacted(turn.actor.tenantKey) } : {}),
    ...(target?.chatId ?? turn.target.chatId ? { chatIdHash: hashRedacted(target?.chatId ?? turn.target.chatId ?? '') } : {}),
    ...(turn.actor?.userId || turn.actor?.openId ? { userIdHash: hashRedacted(turn.actor.userId ?? turn.actor.openId ?? '') } : {})
  };
}

export function actorFromTurn(turn: InboundTurn): JsonRecord {
  const id = turn.actor?.userId ?? turn.actor?.openId ?? turn.actor?.tenantKey ?? 'unknown-feishu-actor';
  return {
    type: 'human',
    id,
    ...(turn.actor?.displayName ? { displayName: turn.actor.displayName } : {})
  };
}

export function failed(message: string): ProviderExecutionResult {
  return {
    providerKey: PMS_AGENT_PENDING_ACTION_PROVIDER_KEY,
    status: 'failed',
    message
  };
}

export function stringField(payload: JsonRecord | undefined, key: string): string | undefined {
  const value = payload?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function recordField(payload: JsonRecord | undefined, key: string): JsonRecord | undefined {
  const value = payload?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined;
}

export function hashRedacted(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function nonEmpty(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
