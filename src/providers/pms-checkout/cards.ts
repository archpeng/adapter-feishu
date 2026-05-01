import { renderInteractiveCard } from '../../cards/templates.js';
import {
  pmsCheckoutConfirmAction,
  pmsCheckoutFacts,
  type PmsCheckoutDryRunCardInput,
  type PmsCheckoutResultProjection
} from './contracts.js';

export function renderPmsCheckoutDryRunCard(input: PmsCheckoutDryRunCardInput, pendingId: string): Record<string, unknown> {
  return renderInteractiveCard({
    title: `退房预演：房间 ${input.roomNumber}`,
    summary: `PMS 建议为房间 ${input.roomNumber} 办理退房。请人工核对后点击确认按钮。`,
    severity: 'info',
    bodyMarkdown: [
      '**仅 PMS 预演。**',
      '点击确认会调用 PMS 受控确认路径；飞书不拥有退房状态机。'
    ].join('\n'),
    facts: pmsCheckoutFacts(input),
    actions: [pmsCheckoutConfirmAction(input, pendingId)]
  });
}

export function renderPmsCheckoutResultCard(result: PmsCheckoutResultProjection): Record<string, unknown> {
  if (!result.ok) {
    return renderInteractiveCard({
      title: `退房失败${result.roomNumber ? `：房间 ${result.roomNumber}` : ''}`,
      summary: 'PMS 拒绝了退房命令，请按关联号排查。',
      severity: 'warning',
      bodyMarkdown: '飞书仅展示 PMS 结构化反馈；PMS 仍是退房事实来源。',
      facts: [
        ...(result.roomId ? [{ label: '房间ID', value: result.roomId }] : []),
        { label: '错误数量', value: String(result.errors.length) },
        { label: '操作人', value: actorText(result.actor) },
        { label: '关联号', value: result.correlationId },
        { label: '幂等键', value: result.idempotencyKey }
      ]
    });
  }

  return renderInteractiveCard({
    title: `退房完成：房间 ${result.roomNumber}`,
    summary: result.housekeepingTaskId
      ? `PMS 已完成房间 ${result.roomNumber} 退房，并创建保洁任务 ${result.housekeepingTaskId}。`
      : `PMS 已完成房间 ${result.roomNumber} 退房，并记录审计 ${result.auditId}。`,
    severity: 'info',
    bodyMarkdown: 'PMS 是退房状态的唯一事实来源；此飞书卡片仅展示投影结果。',
    facts: [
      { label: '房间', value: `${result.roomNumber} (${result.roomId})` },
      { label: '原状态', value: statusText(result.previousStatus) },
      { label: '新状态', value: statusText(result.nextStatus) },
      ...(result.housekeepingTaskId ? [{ label: '保洁任务', value: result.housekeepingTaskId }] : []),
      { label: '审计记录', value: result.auditId },
      { label: '事件', value: result.eventTypes.map(eventTypeText).join('、') },
      { label: '操作人', value: actorText(result.actor) },
      { label: '关联号', value: result.correlationId },
      { label: '幂等键', value: result.idempotencyKey }
    ]
  });
}

function statusText(status: { readonly occupancy: string; readonly cleaning: string; readonly sale: string }): string {
  return `${statusValueText(status.occupancy)}/${statusValueText(status.cleaning)}/${statusValueText(status.sale)}`;
}

function statusValueText(value: string): string {
  const normalized = value.trim().toLowerCase();
  const mapping: Record<string, string> = {
    vacant: '空房',
    dueout: '预离',
    inhouse: '在住',
    occupied: '在住',
    clean: '干净',
    dirty: '脏房',
    cleaning: '清洁中',
    inspection: '待查',
    rework: '返工',
    sellable: '可售',
    stopsell: '停售',
    outoforder: '停用',
  };
  return mapping[normalized] ?? value;
}

function eventTypeText(eventType: string): string {
  const mapping: Record<string, string> = {
    RoomCheckedOut: '房间已退房',
    HousekeepingTaskCreated: '已创建保洁任务',
  };
  return mapping[eventType] ?? eventType;
}

function actorText(actor: { readonly type: string; readonly id: string; readonly displayName?: string }): string {
  const actorType = actor.type === 'human' ? '人员' : actor.type;
  return actor.displayName ? `${actor.displayName} (${actorType}:${actor.id})` : `${actorType}:${actor.id}`;
}
