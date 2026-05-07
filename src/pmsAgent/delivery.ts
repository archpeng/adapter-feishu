import { createHash } from 'node:crypto';
import type { JsonRecord, ProviderAction, ProviderFact, ProviderNotification } from '../core/contracts.js';
import type { ProviderCallbackForwarder, ProviderExecutionResult } from '../providers/contracts.js';
import type { PendingActionRecord, PendingStore } from '../state/pendingStore.js';
import type { DeliveryTarget, InboundTurn } from '../core/contracts.js';
import {
  PMS_AGENT_PENDING_ACTION_ID,
  PMS_AGENT_PENDING_ACTION_PROVIDER_KEY,
  PMS_AGENT_PROVIDER_KEY,
  type AgentResult,
  type PmsApprovalCard,
  type PmsReservationGroupSelection,
} from './contracts.js';

export const PMS_AGENT_CONFIRM_OPERATION = 'pms.pending_action.confirm';
export const PMS_AGENT_CANCEL_OPERATION = 'pms.pending_action.cancel';

type PmsAgentOperation = typeof PMS_AGENT_CONFIRM_OPERATION | typeof PMS_AGENT_CANCEL_OPERATION;

export function pmsAgentResultNotifications(input: {
  readonly result: AgentResult;
  readonly turn: InboundTurn;
  readonly pendingStore: PendingStore;
  readonly now: () => string;
}): ProviderNotification[] {
  switch (input.result.type) {
    case 'text':
      return [baseNotification(input, {
        notificationId: `pms-agent-text-${input.turn.turnId}`,
        title: 'PMS智能助手',
        summary: input.result.text.trim(),
        rawPayload: { source: PMS_AGENT_PROVIDER_KEY, resultType: 'text' }
      })];
    case 'refusal':
      return [baseNotification(input, {
        notificationId: `pms-agent-refusal-${input.turn.turnId}`,
        title: 'PMS智能助手',
        summary: input.result.message.trim(),
        rawPayload: { source: PMS_AGENT_PROVIDER_KEY, resultType: 'refusal', reason: input.result.reason }
      })];
    case 'proposal':
      return [baseNotification(input, {
        notificationId: `pms-agent-proposal-${input.result.proposalId}`,
        title: input.result.title,
        summary: input.result.summary,
        bodyMarkdown: '**需要人工审批后才能执行。**',
        facts: [{ label: '方案编号', value: input.result.proposalId }],
        rawPayload: {
          source: PMS_AGENT_PROVIDER_KEY,
          resultType: 'proposal',
          proposalId: input.result.proposalId,
          approvalRequired: true
        }
      })];
    case 'approval_card':
      return [approvalCardNotification(input, input.result.card)];
  }
}

export function isPmsAgentPendingAction(providerKey: string, actionId: string): boolean {
  return providerKey === PMS_AGENT_PENDING_ACTION_PROVIDER_KEY && actionId === PMS_AGENT_PENDING_ACTION_ID;
}

export async function handlePmsAgentPendingAction(input: {
  readonly turn: InboundTurn;
  readonly pendingRecord: PendingActionRecord;
  readonly callbackForwarder?: ProviderCallbackForwarder;
}): Promise<ProviderExecutionResult> {
  const operation = operationFromCallback(input.turn.callback?.value ?? {});
  if (!operation) return failed('invalid_pms_agent_pending_action');
  if (!input.callbackForwarder) return failed('pms_agent_pending_action_callback_forwarder_required');
  const pendingAction = pendingActionFromRecord(recordField(input.pendingRecord.payload, 'pendingAction'));
  if (!pendingAction) return failed('missing_pms_agent_pending_action_ref');

  const correlationId = stringField(input.turn.callback?.value, 'correlationId')
    ?? stringField(input.pendingRecord.payload, 'correlationId')
    ?? `pms-agent:${input.pendingRecord.pendingId}`;
  const request: JsonRecord = {
    operation,
    pendingActionRef: pendingAction.pendingActionRef,
    actor: actorFromTurn(input.turn),
    scope: pendingActionScope(input.turn, input.pendingRecord.target, pendingAction.propertyId),
    clientToken: `${operation}:${input.pendingRecord.pendingId}`,
    requestFingerprint: `fingerprint:${operation}:${input.pendingRecord.pendingId}`,
    correlationId,
    requestedAt: input.turn.receivedAt,
    ...(pendingAction.cardPayloadRef ? { cardPayloadRef: pendingAction.cardPayloadRef } : {}),
    ...(operation === PMS_AGENT_CANCEL_OPERATION ? { reason: '用户点击飞书 PMS approval card 取消按钮。' } : {})
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
      reason: 'adapter-feishu validated a PMS Agent approval-card action.',
      correlationId,
      requestedAt: input.turn.receivedAt,
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
        providerKey: PMS_AGENT_PENDING_ACTION_PROVIDER_KEY,
        pendingId: input.pendingRecord.pendingId,
        actionId: PMS_AGENT_PENDING_ACTION_ID,
        callbackOwner: 'adapter-feishu',
        targetOwner: 'pms-platform',
        naturalLanguageConfirmAllowed: false
      }
    },
    metadata: {
      providerKey: PMS_AGENT_PENDING_ACTION_PROVIDER_KEY,
      pendingId: input.pendingRecord.pendingId,
      actionId: PMS_AGENT_PENDING_ACTION_ID,
      operation,
      rawRefsLogged: false
    }
  });

  const body = forwardResult.body ?? {};
  if (body.ok === false) {
    return failed('pms_agent_pending_action_callback_rejected');
  }

  return {
    providerKey: PMS_AGENT_PENDING_ACTION_PROVIDER_KEY,
    status: 'accepted',
    message: 'pms_agent_pending_action_callback_forwarded',
    rawResponse: {
      statusCode: forwardResult.statusCode,
      body: forwardResult.body ?? {}
    },
    metadata: {
      pendingId: input.pendingRecord.pendingId,
      actionId: PMS_AGENT_PENDING_ACTION_ID,
      operation,
      correlationId
    }
  };
}

export function pmsAgentPendingActionTerminalNotification(input: {
  readonly turn: InboundTurn;
  readonly pendingRecord: PendingActionRecord;
  readonly result: ProviderExecutionResult;
  readonly now: () => string;
}): ProviderNotification {
  const operation = stringField(input.result.metadata, 'operation') === PMS_AGENT_CANCEL_OPERATION ? PMS_AGENT_CANCEL_OPERATION : PMS_AGENT_CONFIRM_OPERATION;
  const rawResponse = recordField(input.result.rawResponse, 'body');
  const pendingAction = recordField(rawResponse, 'pendingAction');
  const status = stringField(pendingAction, 'status') ?? (operation === PMS_AGENT_CANCEL_OPERATION ? 'cancelled' : 'confirmed');
  const mutationStatus = stringField(rawResponse, 'mutationStatus') ?? stringField(pendingAction, 'mutationStatus') ?? (operation === PMS_AGENT_CANCEL_OPERATION ? 'none' : 'deferred');
  const idempotencyStatus = stringField(rawResponse, 'idempotencyStatus');
  const workflowType = stringField(pendingAction, 'workflowType');
  const isCancel = operation === PMS_AGENT_CANCEL_OPERATION;
  const target = terminalTarget(input.turn, input.pendingRecord);

  return {
    providerKey: PMS_AGENT_PROVIDER_KEY,
    occurredAt: input.now(),
    target,
    notificationId: `pms-agent-terminal-${input.pendingRecord.pendingId}`,
    title: isCancel ? '预订草稿已取消' : '预订草稿已确认',
    summary: isCancel
      ? 'PMS pending-action 已取消并持久化；没有创建最终预订。'
      : 'PMS pending-action 已确认并持久化为 confirmed；最终 reservation 仍由 PMS 后续能力创建。',
    bodyMarkdown: isCancel
      ? '**已取消。**\n该卡片已进入终态，不能再次点击。'
      : '**已确认预订草稿。**\n该卡片已进入终态，不能再次点击；当前不是最终订房成功凭证。',
    facts: [
      { label: '状态', value: status },
      { label: '持久化语义', value: mutationStatus },
      ...(idempotencyStatus ? [{ label: '幂等状态', value: idempotencyStatus }] : []),
      ...(workflowType ? [{ label: '工作流类型', value: workflowType }] : [])
    ],
    rawPayload: {
      source: PMS_AGENT_PROVIDER_KEY,
      resultType: 'pending_action_terminal',
      operation,
      status,
      mutationStatus,
      rawRefsLogged: false
    },
    metadata: {
      projectionKind: 'pmsAgentPendingActionTerminal',
      pendingId: input.pendingRecord.pendingId,
      callbackOwner: 'adapter-feishu',
      targetOwner: 'pms-platform',
      terminal: true
    }
  };
}

function approvalCardNotification(input: {
  readonly result: AgentResult;
  readonly turn: InboundTurn;
  readonly pendingStore: PendingStore;
  readonly now: () => string;
}, card: PmsApprovalCard): ProviderNotification {
  const pendingAction = pendingActionFromRef(card.ref);
  const pendingRefForHash = pendingAction?.pendingActionRef ?? 'missing-pending-action-ref';
  const correlationId = `pms-agent:${hashRedacted(`${pendingRefForHash}:${pendingAction?.cardPayloadRef ?? ''}`)}`;
  const pendingId = `pms-agent-${hashRedacted(`${pendingRefForHash}:${pendingAction?.cardPayloadRef ?? ''}`)}`;
  const pendingRecord = input.pendingStore.put({
    providerKey: PMS_AGENT_PENDING_ACTION_PROVIDER_KEY,
    pendingId,
    actionId: PMS_AGENT_PENDING_ACTION_ID,
    target: input.turn.target,
    payload: {
      pendingKind: 'pms-agent-v2.pending-action-card.v1',
      providerKey: PMS_AGENT_PENDING_ACTION_PROVIDER_KEY,
      actionId: PMS_AGENT_PENDING_ACTION_ID,
      correlationId,
      ...(pendingAction ? { pendingAction: pendingActionToRecord(pendingAction) } : {}),
      callbackOwner: 'adapter-feishu',
      targetOwner: 'pms-platform',
      naturalLanguageConfirmAllowed: false,
      rawRefsVisibleToCustomerText: false
    },
    metadata: {
      pendingKind: 'pms-agent-v2.pending-action-card.v1',
      correlationId,
      pendingActionRefHash: hashRedacted(pendingRefForHash),
      ...(pendingAction?.cardPayloadRef ? { cardPayloadRefHash: hashRedacted(pendingAction.cardPayloadRef) } : {}),
      ...(card.ref.tenantId ? { tenantIdHash: hashRedacted(card.ref.tenantId) } : {})
    }
  });

  return baseNotification(input, {
    notificationId: `pms-agent-approval-card-${pendingRecord.pendingId}`,
    title: card.title,
    summary: card.summary,
    bodyMarkdown: approvalCardBodyMarkdown(card),
    facts: reservationGroupFacts(card),
    actions: [cardAction(pendingRecord.pendingId, correlationId, card.confirmLabel, PMS_AGENT_CONFIRM_OPERATION), cardAction(pendingRecord.pendingId, correlationId, card.cancelLabel, PMS_AGENT_CANCEL_OPERATION)],
    rawPayload: {
      source: PMS_AGENT_PROVIDER_KEY,
      resultType: 'approval_card',
      ...(card.reservationGroup ? { reservationGroupCard: true, quoteStatus: card.reservationGroup.quoteStatus } : {}),
      pendingActionRefHash: hashRedacted(pendingRefForHash),
      ...(pendingAction?.cardPayloadRef ? { cardPayloadRefHash: hashRedacted(pendingAction.cardPayloadRef) } : {}),
      ...(card.ref.tenantId ? { tenantIdHash: hashRedacted(card.ref.tenantId) } : {}),
      rawRefsLogged: false
    },
    metadata: {
      projectionKind: 'pmsAgentApprovalCard',
      pendingId: pendingRecord.pendingId,
      callbackOwner: 'adapter-feishu',
      targetOwner: 'pms-platform',
      naturalLanguageConfirmAllowed: false
    }
  });
}

function baseNotification(input: {
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

function terminalTarget(turn: InboundTurn, pendingRecord: PendingActionRecord): DeliveryTarget {
  const callbackMessageId = stringField(turn.metadata, 'openMessageId');
  return {
    ...(pendingRecord.target ?? turn.target),
    ...(callbackMessageId || turn.target.messageId ? { messageId: callbackMessageId ?? turn.target.messageId } : {})
  };
}

function approvalCardBodyMarkdown(card: PmsApprovalCard): string {
  const lines = ['**需要点击卡片按钮后才会转交 PMS pending-action；确认后表示预订草稿已确认，不代表最终预订已创建。**'];
  if (card.reservationGroup?.quoteStatus === 'pricingUnsupported') {
    lines.push('PMS 当前未提供多房预订价格；adapter-feishu 不编造价格，仅展示待确认的房间选择。');
  }
  return lines.join('\n');
}

function reservationGroupFacts(card: PmsApprovalCard): ProviderFact[] | undefined {
  const group = card.reservationGroup;
  if (!group) return undefined;
  return [
    { label: '客人', value: group.guestDisplayName },
    { label: '入住日期', value: group.arrivalDate },
    { label: '离店日期', value: group.departureDate },
    { label: '房间数量', value: String(group.quantity) },
    ...group.selections.map((selection, index) => ({
      label: `房间 ${index + 1}`,
      value: roomSelectionFactValue(selection)
    })),
    { label: '报价状态', value: 'PMS 暂不提供价格' }
  ];
}

function roomSelectionFactValue(selection: PmsReservationGroupSelection): string {
  const roomLabel = selection.roomNumber ?? selection.roomId;
  return selection.roomType ? `${roomLabel} / ${selection.roomType}` : roomLabel;
}

function cardAction(pendingId: string, correlationId: string, label: string, operation: PmsAgentOperation): ProviderAction {
  return {
    actionId: PMS_AGENT_PENDING_ACTION_ID,
    label,
    style: operation === PMS_AGENT_CONFIRM_OPERATION ? 'primary' : 'danger',
    payload: {
      providerKey: PMS_AGENT_PENDING_ACTION_PROVIDER_KEY,
      pendingId,
      actionId: PMS_AGENT_PENDING_ACTION_ID,
      operation,
      correlationId
    }
  };
}

function operationFromCallback(value: JsonRecord): PmsAgentOperation | undefined {
  const operation = stringField(value, 'operation');
  return operation === PMS_AGENT_CONFIRM_OPERATION || operation === PMS_AGENT_CANCEL_OPERATION ? operation : undefined;
}

interface PmsAgentPlatformPendingActionRef {
  pendingActionRef: string;
  cardPayloadRef: string;
  quoteRef?: string;
  propertyId: string;
}

function pendingActionFromRef(ref: PmsApprovalCard['ref']): PmsAgentPlatformPendingActionRef | undefined {
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

function pendingActionFromRecord(record: JsonRecord | undefined): PmsAgentPlatformPendingActionRef | undefined {
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

function pendingActionToRecord(pendingAction: PmsAgentPlatformPendingActionRef): JsonRecord {
  return {
    pendingActionRef: pendingAction.pendingActionRef,
    propertyId: pendingAction.propertyId,
    cardPayloadRef: pendingAction.cardPayloadRef,
    ...(pendingAction.quoteRef ? { quoteRef: pendingAction.quoteRef } : {})
  };
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

function actorFromTurn(turn: InboundTurn): JsonRecord {
  const id = turn.actor?.userId ?? turn.actor?.openId ?? turn.actor?.tenantKey ?? 'unknown-feishu-actor';
  return {
    type: 'human',
    id,
    ...(turn.actor?.displayName ? { displayName: turn.actor.displayName } : {})
  };
}

function failed(message: string): ProviderExecutionResult {
  return {
    providerKey: PMS_AGENT_PENDING_ACTION_PROVIDER_KEY,
    status: 'failed',
    message
  };
}

function stringField(payload: JsonRecord | undefined, key: string): string | undefined {
  const value = payload?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function recordField(payload: JsonRecord | undefined, key: string): JsonRecord | undefined {
  const value = payload?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function hashRedacted(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function nonEmpty(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
