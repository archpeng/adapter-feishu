import type { ProviderAction, ProviderFact, ProviderNotification } from '../../core/contracts.js';
import type { PendingStore } from '../../state/pendingStore.js';
import {
  PMS_AGENT_PENDING_ACTION_ID,
  PMS_AGENT_PENDING_ACTION_PROVIDER_KEY,
  PMS_AGENT_PROVIDER_KEY,
  type AgentResult,
  type PmsApprovalCard,
  type PmsReservationGroupSelection
} from '../contracts.js';
import {
  baseNotification,
  hashRedacted,
  pendingActionFromRef,
  pendingActionToRecord,
  PMS_AGENT_CANCEL_OPERATION,
  PMS_AGENT_CONFIRM_OPERATION,
  type PmsAgentOperation
} from './shared.js';
import type { InboundTurn } from '../../core/contracts.js';

export function approvalCardNotification(input: {
  readonly result: AgentResult;
  readonly turn: InboundTurn;
  readonly pendingStore: PendingStore;
  readonly now: () => string;
}, card: PmsApprovalCard): ProviderNotification {
  const pendingAction = pendingActionFromRef(card.ref);
  if (!pendingAction) {
    return invalidApprovalCardNotification(input);
  }

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

function invalidApprovalCardNotification(input: {
  readonly turn: InboundTurn;
  readonly now: () => string;
}): ProviderNotification {
  return baseNotification(input, {
    notificationId: `pms-agent-approval-card-invalid-${input.turn.turnId}`,
    title: 'PMS审批卡不可用',
    summary: 'PMS审批卡缺少必要 pending-action 引用，未生成可点击确认按钮。',
    bodyMarkdown: '请重新发起预订准备流程。',
    rawPayload: {
      source: PMS_AGENT_PROVIDER_KEY,
      resultType: 'approval_card_invalid',
      rawRefsLogged: false
    },
    metadata: {
      projectionKind: 'pmsAgentApprovalCardInvalid',
      callbackOwner: 'adapter-feishu',
      targetOwner: 'pms-platform',
      naturalLanguageConfirmAllowed: false
    }
  });
}

function approvalCardBodyMarkdown(card: PmsApprovalCard): string {
  const lines = ['**需要点击卡片按钮后才会转交 PMS pending-action；确认成功后会由 PMS 平台创建正式预订和房间分配。**'];
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
