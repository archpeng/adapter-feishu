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
  return validateWarningAgentNotificationPayload(value).length === 0;
}

export function getWarningAgentDedupeKey(payload: WarningAgentNotificationPayload): string {
  return payload.incidentId ?? payload.reportId;
}

export function validateWarningAgentNotificationPayload(value: JsonRecord): string[] {
  const errors: string[] = [];

  requireNonEmptyString(errors, value.reportId, 'reportId');
  requireNonEmptyString(errors, value.runId, 'runId');
  requireNonEmptyString(errors, value.summary, 'summary');
  optionalString(errors, value.title, 'title');
  optionalString(errors, value.occurredAt, 'occurredAt');
  optionalString(errors, value.bodyMarkdown, 'bodyMarkdown');
  optionalString(errors, value.reportUrl, 'reportUrl');
  optionalString(errors, value.incidentId, 'incidentId');
  optionalSeverity(errors, value.severity, 'severity');
  optionalTarget(errors, value.target, 'target');
  optionalFacts(errors, value.facts, 'facts');
  optionalActions(errors, value.actions, 'actions');

  return errors;
}

function requireNonEmptyString(errors: string[], value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${field} must be a non-empty string`);
  }
}

function optionalString(errors: string[], value: unknown, field: string): void {
  if (value !== undefined && typeof value !== 'string') {
    errors.push(`${field} must be a string when provided`);
  }
}

function optionalSeverity(errors: string[], value: unknown, field: string): void {
  if (value === undefined) {
    return;
  }

  if (value !== 'info' && value !== 'warning' && value !== 'critical') {
    errors.push(`${field} must be one of info, warning, critical`);
  }
}

function optionalTarget(errors: string[], value: unknown, field: string): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    errors.push(`${field} must be an object when provided`);
    return;
  }

  const target = value as unknown as DeliveryTarget;
  if (target.channel !== 'feishu') {
    errors.push(`${field}.channel must be feishu`);
  }

  if (!hasNonEmptyString(target.chatId) && !hasNonEmptyString(target.openId)) {
    errors.push(`${field} must include chatId or openId`);
  }
}

function optionalFacts(errors: string[], value: unknown, field: string): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array when provided`);
    return;
  }

  value.forEach((fact, index) => {
    if (!isRecord(fact)) {
      errors.push(`${field}[${index}] must be an object`);
      return;
    }

    requireNonEmptyString(errors, fact.label, `${field}[${index}].label`);
    requireNonEmptyString(errors, fact.value, `${field}[${index}].value`);
  });
}

function optionalActions(errors: string[], value: unknown, field: string): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array when provided`);
    return;
  }

  value.forEach((action, index) => {
    if (!isRecord(action)) {
      errors.push(`${field}[${index}] must be an object`);
      return;
    }

    requireNonEmptyString(errors, action.actionId, `${field}[${index}].actionId`);
    requireNonEmptyString(errors, action.label, `${field}[${index}].label`);

    if (
      action.style !== undefined &&
      action.style !== 'default' &&
      action.style !== 'primary' &&
      action.style !== 'danger'
    ) {
      errors.push(`${field}[${index}].style must be default, primary, or danger`);
    }

    if (action.payload !== undefined && !isRecord(action.payload)) {
      errors.push(`${field}[${index}].payload must be an object when provided`);
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}
