import { PmsBaseProjectionError } from './errors.js';
import { isRecord } from './shared.js';

export const BITABLE_RECORD_ID_PATTERN = /\b(?:rec_[a-zA-Z0-9_/-]{3,}|rec[a-zA-Z0-9]{12,})\b/;

const TRACKED_TARGET_ID_PATTERN = /\b(?:bascn|tbl|fld|vew|form|rec)(?=[a-zA-Z0-9]{12,}\b)(?=[a-zA-Z0-9]*\d)[a-zA-Z0-9]{12,}\b/;
const RAW_TARGET_KEY_PATTERN = /^(target|appToken|tableId|formId|recordId|callbackUrl|callbackURL|token|authToken)$/;
const CALLBACK_URL_PATTERN = /https?:\/\/[^\s`"']*(?:callback|webhook|feishu|lark|bitable)[^\s`"']*/gi;
const SECRET_ASSIGNMENT_PATTERN = /\b(?:appToken|tableId|formId|recordId|callback|tenantId|tenant|token|secret|authorization)\b\s*[:=]\s*[^\s,;]+/gi;

export function sanitizeProjectionStatusFields(fields: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(fields)) {
    if (RAW_TARGET_KEY_PATTERN.test(field)) {
      throw new PmsBaseProjectionError('invalid_payload', `projection_status_field_not_allowed:${field}`);
    }
    if (field === 'lastErrorSummary') {
      result[field] = typeof value === 'string' ? redactProjectionStatusText(value) : value;
      continue;
    }
    rejectUnsafeProjectionStatusValue(field, value);
    result[field] = value;
  }
  return result;
}

export function looksLikeUnsafeProjectionStatusText(value: string): boolean {
  CALLBACK_URL_PATTERN.lastIndex = 0;
  SECRET_ASSIGNMENT_PATTERN.lastIndex = 0;
  return (
    BITABLE_RECORD_ID_PATTERN.test(value) ||
    TRACKED_TARGET_ID_PATTERN.test(value) ||
    CALLBACK_URL_PATTERN.test(value) ||
    SECRET_ASSIGNMENT_PATTERN.test(value)
  );
}

function rejectUnsafeProjectionStatusValue(field: string, value: unknown): void {
  if (typeof value === 'string' && looksLikeUnsafeProjectionStatusText(value)) {
    throw new PmsBaseProjectionError('invalid_payload', `unsafe_projection_status_value:${field}`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectUnsafeProjectionStatusValue(`${field}[${index}]`, entry));
    return;
  }
  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (RAW_TARGET_KEY_PATTERN.test(key)) {
        throw new PmsBaseProjectionError('invalid_payload', `projection_status_field_not_allowed:${field}.${key}`);
      }
      rejectUnsafeProjectionStatusValue(`${field}.${key}`, entry);
    }
  }
}

function redactProjectionStatusText(value: string): string {
  return value
    .replace(CALLBACK_URL_PATTERN, '[redacted-url]')
    .replace(SECRET_ASSIGNMENT_PATTERN, '[redacted-secret]')
    .replace(TRACKED_TARGET_ID_PATTERN, '[redacted-id]')
    .replace(BITABLE_RECORD_ID_PATTERN, '[redacted-record]');
}
