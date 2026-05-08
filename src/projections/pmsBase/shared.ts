import type {
  BitableRecord,
  BitableTableField,
  BitableTableTarget
} from '../../channels/feishu/bitableClient.js';
import { PmsBaseProjectionError } from './errors.js';
import type {
  PmsBaseProjectionBinding,
  PmsBaseProjectionBindingKey,
  PmsBaseProjectionDeps,
  PmsBaseProjectionRegistry
} from './types.js';

export const DEFAULT_RECORD_PAGE_SIZE = 500;
export const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireBinding(
  registry: PmsBaseProjectionRegistry,
  bindingKey: PmsBaseProjectionBindingKey
): PmsBaseProjectionBinding {
  const binding = registry.bindings[bindingKey];
  if (!binding) {
    throw new PmsBaseProjectionError('projection_registry_missing_binding', `${bindingKey}_binding_missing`, 503);
  }
  if (!binding.enabled) {
    throw new PmsBaseProjectionError('projection_binding_disabled', `${bindingKey}_binding_disabled`, 503);
  }
  return binding;
}

export function mapUpdateFields(
  binding: PmsBaseProjectionBinding,
  fields: Record<string, unknown>
): Record<string, unknown> {
  if (!isRecord(fields) || Object.keys(fields).length === 0) {
    throw new PmsBaseProjectionError('invalid_payload', 'fields_required');
  }

  const allowedBusinessFields = new Set(binding.updateAllowedFields);
  const result: Record<string, unknown> = {};

  for (const [businessField, value] of Object.entries(fields)) {
    if (!allowedBusinessFields.has(businessField) || !binding.fieldMap[businessField]) {
      throw new PmsBaseProjectionError('field_not_allowed', `field_not_allowed:${businessField}`);
    }
    result[binding.fieldMap[businessField]] = toBitableCellValue(businessField, value);
  }

  return result;
}

export async function assertSchemaFields(
  deps: PmsBaseProjectionDeps,
  binding: PmsBaseProjectionBinding,
  businessFields: string[]
): Promise<void> {
  if (deps.validateSchema === false || deps.registry.policy.validateSchemaByDefault === false) {
    return;
  }

  const tableFields = await listAllTableFields(deps, binding.target);
  const tableFieldNames = new Set(tableFields.map((field) => field.fieldName).filter(isNonEmptyString));

  for (const businessField of businessFields) {
    const feishuFieldName = binding.fieldMap[businessField];
    if (!feishuFieldName) {
      throw new PmsBaseProjectionError('schema_drift', `schema_mapping_missing:${binding.bindingKey}:${businessField}`, 502);
    }
    if (!tableFieldNames.has(feishuFieldName)) {
      throw new PmsBaseProjectionError('schema_drift', `schema_field_missing:${binding.bindingKey}:${businessField}`, 502);
    }
  }
}

export async function findUniqueRecordByBusinessField(
  deps: PmsBaseProjectionDeps,
  binding: PmsBaseProjectionBinding,
  businessField: string,
  expectedValue: string,
  errors: { notFoundCode: string; duplicateCode: string }
): Promise<BitableRecord> {
  const feishuFieldName = binding.fieldMap[businessField];
  if (!feishuFieldName) {
    throw new PmsBaseProjectionError('schema_drift', `schema_mapping_missing:${binding.bindingKey}:${businessField}`, 502);
  }

  const records = await listAllRecords(deps, binding.target);
  const matches = records.filter((record) => fieldValueMatches(record.fields[feishuFieldName], expectedValue));
  if (matches.length === 0) {
    throw new PmsBaseProjectionError(errors.notFoundCode, errors.notFoundCode, 404);
  }
  if (matches.length > 1) {
    throw new PmsBaseProjectionError(errors.duplicateCode, errors.duplicateCode, 409);
  }
  return matches[0];
}

export async function findOptionalUniqueRecordByBusinessField(
  deps: PmsBaseProjectionDeps,
  binding: PmsBaseProjectionBinding,
  businessField: string,
  expectedValue: string,
  errors: { duplicateCode: string }
): Promise<BitableRecord | undefined> {
  const feishuFieldName = binding.fieldMap[businessField];
  if (!feishuFieldName) {
    throw new PmsBaseProjectionError('schema_drift', `schema_mapping_missing:${binding.bindingKey}:${businessField}`, 502);
  }

  const records = await listAllRecords(deps, binding.target);
  const matches = records.filter((record) => fieldValueMatches(record.fields[feishuFieldName], expectedValue));
  if (matches.length > 1) {
    throw new PmsBaseProjectionError(errors.duplicateCode, errors.duplicateCode, 409);
  }
  return matches[0];
}

export async function listAllRecords(
  deps: PmsBaseProjectionDeps,
  target: BitableTableTarget
): Promise<BitableRecord[]> {
  const items: BitableRecord[] = [];
  let pageToken: string | undefined;

  while (true) {
    const page = await deps.bitableClient.listRecords({
      ...target,
      pageSize: DEFAULT_RECORD_PAGE_SIZE,
      pageToken
    });
    items.push(...page.items);

    if (!page.hasMore || !page.pageToken) {
      break;
    }
    pageToken = page.pageToken;
  }

  return items;
}

export async function listAllTableFields(
  deps: PmsBaseProjectionDeps,
  target: BitableTableTarget
): Promise<BitableTableField[]> {
  const items: BitableTableField[] = [];
  let pageToken: string | undefined;

  while (true) {
    const page = await deps.bitableClient.listTableFields({
      ...target,
      pageSize: DEFAULT_RECORD_PAGE_SIZE,
      pageToken
    });
    items.push(...page.items);

    if (!page.hasMore || !page.pageToken) {
      break;
    }
    pageToken = page.pageToken;
  }

  return items;
}

export function toBusinessRecord(record: BitableRecord, binding: PmsBaseProjectionBinding): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [businessField, feishuFieldName] of Object.entries(binding.fieldMap)) {
    if (record.fields[feishuFieldName] !== undefined) {
      result[businessField] = record.fields[feishuFieldName];
    }
  }
  return result;
}

export function mapCreateFields(
  binding: PmsBaseProjectionBinding,
  fields: Record<string, unknown>
): Record<string, unknown> {
  if (!isRecord(fields) || Object.keys(fields).length === 0) {
    throw new PmsBaseProjectionError('invalid_payload', 'fields_required');
  }

  const result: Record<string, unknown> = {};
  for (const [businessField, value] of Object.entries(fields)) {
    const feishuFieldName = binding.fieldMap[businessField];
    if (!feishuFieldName) {
      throw new PmsBaseProjectionError('field_not_allowed', `field_not_allowed:${businessField}`);
    }
    result[feishuFieldName] = toBitableCellValue(businessField, value);
  }
  return result;
}

export function assertRequiredCreateFields(
  binding: PmsBaseProjectionBinding,
  fields: Record<string, unknown>
): void {
  for (const businessField of binding.requiredFields) {
    if (fields[businessField] === undefined || fields[businessField] === null || fields[businessField] === '') {
      throw new PmsBaseProjectionError('invalid_payload', `required_field_missing:${businessField}`);
    }
  }
}

export function pickAllowedFields(
  allowedFields: readonly string[],
  fields: Record<string, unknown>
): Record<string, unknown> {
  const allowed = new Set(allowedFields);
  const result: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(fields)) {
    if (allowed.has(field)) {
      result[field] = value;
    }
  }
  return result;
}

export function requireRecordId(record: BitableRecord, code: string): string {
  if (!record.recordId) {
    throw new PmsBaseProjectionError(code, code, 502);
  }
  return record.recordId;
}

export function fieldValueMatches(value: unknown, expectedValue: string): boolean {
  if (typeof value === 'string') {
    return value.trim() === expectedValue;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value) === expectedValue;
  }
  return false;
}

export function statusIn(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === 'string' && allowed.includes(value);
}

export function sameBusinessDate(value: unknown, businessDate: string): boolean {
  const expected = businessDate.slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10) === expected;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return false;
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? trimmed.slice(0, 10) === expected : new Date(parsed).toISOString().slice(0, 10) === expected;
  }
  return false;
}

export function uniqueFields(values: string[]): string[] {
  return [...new Set(values)];
}

export function isPmsBaseProjectionBindingKey(value: string): value is PmsBaseProjectionBindingKey {
  return (
    value === 'roomLedger' ||
    value === 'operationRequests' ||
    value === 'housekeepingTasks' ||
    value === 'maintenanceTickets' ||
    value === 'reservations' ||
    value === 'stays' ||
    value === 'inventoryCalendar' ||
    value === 'operationLogs' ||
    value === 'projectionStatus'
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown_error';
}

function toBitableCellValue(businessField: string, value: unknown): unknown {
  if (/(At|Date)$/.test(businessField) && typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
