import { createHash } from 'node:crypto';
import type { JsonRecord, ProviderAction, ProviderNotification } from '../core/contracts.js';
import type { ProviderCallbackForwarder, ProviderExecutionResult } from '../providers/contracts.js';
import type { PendingActionRecord, PendingStore } from '../state/pendingStore.js';
import type { InboundTurn } from '../core/contracts.js';
import {
  PMS_AGENT_PENDING_ACTION_ID,
  PMS_AGENT_PENDING_ACTION_PROVIDER_KEY,
  PMS_AGENT_PROVIDER_KEY,
  type AgentResult,
  type PmsApprovalCard,
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
  const pendingAction = recordField(input.pendingRecord.payload, 'pendingAction');
  const pendingActionId = stringField(pendingAction, 'pendingActionId');
  const tenantId = stringField(pendingAction, 'tenantId');
  if (!pendingActionId || !tenantId) return failed('missing_pms_agent_pending_action_ref');

  const correlationId = stringField(input.turn.callback?.value, 'correlationId')
    ?? stringField(input.pendingRecord.payload, 'correlationId')
    ?? `pms-agent:${input.pendingRecord.pendingId}`;
  const request: JsonRecord = {
    operation,
    pendingActionId,
    tenantId,
    actor: actorFromTurn(input.turn),
    clientToken: `${operation}:${input.pendingRecord.pendingId}`,
    requestFingerprint: `fingerprint:${operation}:${input.pendingRecord.pendingId}`,
    correlationId,
    requestedAt: input.turn.receivedAt,
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

function approvalCardNotification(input: {
  readonly result: AgentResult;
  readonly turn: InboundTurn;
  readonly pendingStore: PendingStore;
  readonly now: () => string;
}, card: PmsApprovalCard): ProviderNotification {
  const correlationId = `pms-agent:${hashRedacted(`${card.ref.tenantId}:${card.ref.pendingActionId}`)}`;
  const pendingId = `pms-agent-${hashRedacted(`${card.ref.tenantId}:${card.ref.pendingActionId}`)}`;
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
      pendingAction: card.ref as unknown as JsonRecord,
      callbackOwner: 'adapter-feishu',
      targetOwner: 'pms-platform',
      naturalLanguageConfirmAllowed: false,
      rawRefsVisibleToCustomerText: false
    },
    metadata: {
      pendingKind: 'pms-agent-v2.pending-action-card.v1',
      correlationId,
      pendingActionIdHash: hashRedacted(card.ref.pendingActionId),
      tenantIdHash: hashRedacted(card.ref.tenantId)
    }
  });

  return baseNotification(input, {
    notificationId: `pms-agent-approval-card-${pendingRecord.pendingId}`,
    title: card.title,
    summary: card.summary,
    bodyMarkdown: '**需要点击卡片按钮后才会转交 PMS pending-action。**',
    actions: [cardAction(pendingRecord.pendingId, correlationId, card.confirmLabel, PMS_AGENT_CONFIRM_OPERATION), cardAction(pendingRecord.pendingId, correlationId, card.cancelLabel, PMS_AGENT_CANCEL_OPERATION)],
    rawPayload: {
      source: PMS_AGENT_PROVIDER_KEY,
      resultType: 'approval_card',
      pendingActionIdHash: hashRedacted(card.ref.pendingActionId),
      tenantIdHash: hashRedacted(card.ref.tenantId),
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
