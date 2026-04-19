import { renderInteractiveCard } from '../../cards/templates.js';
import {
  normalizeWarningAgentNotification,
  type NormalizeWarningAgentNotificationOptions,
  type WarningAgentNotificationPayload
} from './normalize.js';

export function renderWarningAgentDiagnosisCard(
  payload: WarningAgentNotificationPayload,
  options: NormalizeWarningAgentNotificationOptions = {}
): Record<string, unknown> {
  const notification = normalizeWarningAgentNotification(payload, options);
  return renderInteractiveCard({
    title: notification.title,
    summary: notification.summary,
    severity: notification.severity,
    bodyMarkdown: notification.bodyMarkdown,
    facts: notification.facts,
    actions: notification.actions
  });
}
