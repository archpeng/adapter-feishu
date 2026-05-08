import type { ProviderNotification } from '../../core/contracts.js';
import type { ProviderExecutionResult } from '../../providers/contracts.js';
import type { PendingActionRecord } from '../../state/pendingStore.js';
import type { InboundTurn } from '../../core/contracts.js';
import { PMS_AGENT_PROVIDER_KEY } from '../contracts.js';
import {
  PMS_AGENT_CANCEL_OPERATION,
  PMS_AGENT_CONFIRM_OPERATION,
  recordField,
  stringField,
  terminalTarget
} from './shared.js';

export function pmsAgentPendingActionTerminalNotification(input: {
  readonly turn: InboundTurn;
  readonly pendingRecord: PendingActionRecord;
  readonly result: ProviderExecutionResult;
  readonly now: () => string;
}): ProviderNotification {
  const operation = stringField(input.result.metadata, 'operation') === PMS_AGENT_CANCEL_OPERATION ? PMS_AGENT_CANCEL_OPERATION : PMS_AGENT_CONFIRM_OPERATION;
  const rawResponse = recordField(input.result.rawResponse, 'body');
  const pendingAction = recordField(rawResponse, 'pendingAction');
  const reservation = recordField(rawResponse, 'reservation');
  const status = stringField(pendingAction, 'status') ?? (operation === PMS_AGENT_CANCEL_OPERATION ? 'cancelled' : 'confirmed');
  const mutationStatus = stringField(rawResponse, 'mutationStatus') ?? stringField(pendingAction, 'mutationStatus') ?? (operation === PMS_AGENT_CANCEL_OPERATION ? 'none' : 'deferred');
  const idempotencyStatus = stringField(rawResponse, 'idempotencyStatus');
  const workflowType = stringField(pendingAction, 'workflowType');
  const isCancel = operation === PMS_AGENT_CANCEL_OPERATION;
  const isCommittedReservation = !isCancel && mutationStatus === 'committed';
  const target = terminalTarget(input.turn, input.pendingRecord);

  return {
    providerKey: PMS_AGENT_PROVIDER_KEY,
    occurredAt: input.now(),
    target,
    notificationId: `pms-agent-terminal-${input.pendingRecord.pendingId}`,
    title: isCancel ? '预订草稿已取消' : isCommittedReservation ? '预订已创建' : '预订草稿已确认',
    summary: isCancel
      ? 'PMS pending-action 已取消并持久化；没有创建最终预订。'
      : isCommittedReservation
        ? 'PMS pending-action 已确认并创建最终预订；预订数据由 PMS 平台持久化。'
      : 'PMS pending-action 已确认并持久化为 confirmed；最终 reservation 仍由 PMS 后续能力创建。',
    bodyMarkdown: isCancel
      ? '**已取消。**\n该卡片已进入终态，不能再次点击。'
      : isCommittedReservation
        ? '**预订已创建。**\n该卡片已进入终态，不能再次点击；预订数据会通过 PMS 投影同步到飞书多维表。'
      : '**已确认预订草稿。**\n该卡片已进入终态，不能再次点击；当前不是最终订房成功凭证。',
    facts: [
      { label: '状态', value: status },
      { label: '持久化语义', value: mutationStatus },
      ...(stringField(reservation, 'reservationCode') ? [{ label: '预订号', value: stringField(reservation, 'reservationCode')! }] : []),
      ...(stringField(reservation, 'roomNumber') ? [{ label: '房号', value: stringField(reservation, 'roomNumber')! }] : []),
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
