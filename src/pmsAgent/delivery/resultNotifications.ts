import type { ProviderNotification } from '../../core/contracts.js';
import type { PendingStore } from '../../state/pendingStore.js';
import {
  PMS_AGENT_PROVIDER_KEY,
  type AgentResult
} from '../contracts.js';
import { approvalCardNotification } from './approvalCard.js';
import { baseNotification } from './shared.js';
import type { InboundTurn } from '../../core/contracts.js';

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
