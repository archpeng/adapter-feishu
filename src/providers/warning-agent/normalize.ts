import type { DeliveryTarget, ProviderAction, ProviderFact, ProviderNotification } from '../../core/contracts.js';
import {
  WARNING_AGENT_PROVIDER_KEY,
  type WarningAgentNotificationPayload
} from './contracts.js';

export { WARNING_AGENT_PROVIDER_KEY, type WarningAgentNotificationPayload } from './contracts.js';

export interface NormalizeWarningAgentNotificationOptions {
  defaultTarget?: DeliveryTarget;
  now?: () => string;
}

export function normalizeWarningAgentNotification(
  payload: WarningAgentNotificationPayload,
  options: NormalizeWarningAgentNotificationOptions = {}
): ProviderNotification {
  return {
    providerKey: WARNING_AGENT_PROVIDER_KEY,
    notificationId: payload.reportId,
    occurredAt: payload.occurredAt ?? options.now?.() ?? new Date().toISOString(),
    title: normalizeTitle(payload),
    summary: payload.summary,
    severity: payload.severity,
    target: payload.target ?? options.defaultTarget,
    bodyMarkdown: payload.bodyMarkdown,
    facts: normalizeFacts(payload),
    actions: normalizeActions(payload),
    dedupeKey: payload.incidentId ?? payload.reportId,
    rawPayload: payload,
    metadata: normalizeMetadata(payload)
  };
}

function normalizeTitle(payload: WarningAgentNotificationPayload): string {
  return payload.title?.trim() || `warning-agent diagnosis ${payload.reportId}`;
}

function normalizeFacts(payload: WarningAgentNotificationPayload): ProviderFact[] {
  const facts: ProviderFact[] = [
    { label: 'report', value: payload.reportId },
    { label: 'run', value: payload.runId }
  ];

  if (payload.incidentId) {
    facts.push({ label: 'incident', value: payload.incidentId });
  }

  if (payload.facts) {
    facts.push(...payload.facts);
  }

  if (payload.reportUrl) {
    facts.push({ label: 'report url', value: payload.reportUrl });
  }

  return facts;
}

function normalizeActions(payload: WarningAgentNotificationPayload): ProviderAction[] | undefined {
  return payload.actions && payload.actions.length > 0 ? payload.actions : undefined;
}

function normalizeMetadata(payload: WarningAgentNotificationPayload): ProviderNotification['metadata'] {
  const metadata: NonNullable<ProviderNotification['metadata']> = {
    runId: payload.runId
  };

  if (payload.reportUrl) {
    metadata.reportUrl = payload.reportUrl;
  }

  return metadata;
}
