export const PMS_AGENT_PROVIDER_KEY = 'pms-agent-v2';
export const PMS_AGENT_AUTH_HEADER = 'X-PMS-AGENT-TOKEN';
export const PMS_AGENT_AUTH_ENV_NAME = 'PMS_AGENT_AUTH_TOKEN';
export const PMS_AGENT_TURN_URL_ENV_NAME = 'PMS_AGENT_TURN_URL';
export const PMS_AGENT_PENDING_ACTION_PROVIDER_KEY = 'pms-agent-v2-pending-action';
export const PMS_AGENT_PENDING_ACTION_ID = 'pms.pending_action';

export type FeishuActorRole = 'customer' | 'staff' | 'admin' | 'internal';

export interface FeishuTurnInput {
  channel: 'feishu';
  tenantId: string;
  sessionId: string;
  messageId: string;
  actor: {
    role: FeishuActorRole;
    id: string;
    displayName?: string;
  };
  message: {
    text: string;
  };
  receivedAt: string;
}

export interface PmsPendingActionRef {
  type: 'pms_pending_action';
  tenantId: string;
  pendingActionId: string;
  action: 'reservation_confirm';
  expiresAt?: string;
}

export interface PmsApprovalCard {
  type: 'pms_pending_action_card';
  ref: PmsPendingActionRef;
  title: string;
  summary: string;
  confirmLabel: string;
  cancelLabel: string;
}

export type AgentResult =
  | { type: 'text'; text: string }
  | { type: 'refusal'; reason: 'policy' | 'unsupported' | 'invalid_request'; message: string }
  | { type: 'proposal'; proposalId: string; title: string; summary: string; approvalRequired: true }
  | { type: 'approval_card'; card: PmsApprovalCard };
