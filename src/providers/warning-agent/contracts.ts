import type {
  DeliveryTarget,
  JsonRecord,
  NotificationSeverity,
  ProviderAction,
  ProviderFact
} from '../../core/contracts.js';

export const WARNING_AGENT_PROVIDER_KEY = 'warning-agent' as const;

export type WarningAgentNotificationPayload = JsonRecord & {
  reportId: string;
  runId: string;
  summary: string;
  title?: string;
  occurredAt?: string;
  severity?: NotificationSeverity;
  bodyMarkdown?: string;
  reportUrl?: string;
  incidentId?: string;
  target?: DeliveryTarget;
  facts?: ProviderFact[];
  actions?: ProviderAction[];
};

export function isWarningAgentNotificationPayload(
  value: JsonRecord
): value is WarningAgentNotificationPayload {
  return (
    typeof value.reportId === 'string' &&
    typeof value.runId === 'string' &&
    typeof value.summary === 'string'
  );
}

export function getWarningAgentDedupeKey(payload: WarningAgentNotificationPayload): string {
  return payload.incidentId ?? payload.reportId;
}
