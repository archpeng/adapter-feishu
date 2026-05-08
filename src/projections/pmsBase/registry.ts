import { readFileSync } from 'node:fs';
import type { BitableTableTarget } from '../../channels/feishu/bitableClient.js';
import {
  errorMessage,
  isPmsBaseProjectionBindingKey,
  isRecord,
  normalizeString
} from './shared.js';
import type {
  PmsBaseProjectionBinding,
  PmsBaseProjectionBindingKey,
  PmsBaseProjectionBindingPolicy,
  PmsBaseProjectionRegistry
} from './types.js';

const ALL_BINDING_KEYS: PmsBaseProjectionBindingKey[] = [
  'roomLedger',
  'operationRequests',
  'housekeepingTasks',
  'maintenanceTickets',
  'reservations',
  'stays',
  'inventoryCalendar',
  'operationLogs',
  'projectionStatus'
];
const REQUIRED_BINDING_KEYS: PmsBaseProjectionBindingKey[] = ['roomLedger', 'operationRequests', 'operationLogs'];
const DEFAULT_POLICY: PmsBaseProjectionBindingPolicy = {
  validateSchemaByDefault: true,
  rejectUnmappedFields: true
};

export function loadPmsBaseProjectionRegistry(registryPath: string): PmsBaseProjectionRegistry {
  let raw: string;

  try {
    raw = readFileSync(registryPath, 'utf8');
  } catch (error) {
    throw new Error(
      `Failed to load ADAPTER_FEISHU_PMS_BASE_REGISTRY_PATH (${registryPath}): ${errorMessage(error)}`
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Invalid ADAPTER_FEISHU_PMS_BASE_REGISTRY_PATH JSON (${registryPath}): ${errorMessage(error)}`
    );
  }

  return parsePmsBaseProjectionRegistry(parsed, registryPath);
}

export function parsePmsBaseProjectionRegistry(
  value: unknown,
  source = 'PMS Base projection registry'
): PmsBaseProjectionRegistry {
  const errors: string[] = [];

  if (!isRecord(value)) {
    throw new Error(`PMS Base projection registry invalid (${source}): root must be an object`);
  }

  if (value.version !== 1) {
    errors.push('version must be 1');
  }

  const policy = parsePolicy(value.policy, 'policy', errors);
  const bindingsValue = value.bindings;
  if (!isRecord(bindingsValue)) {
    errors.push('bindings must be an object');
  }

  const bindings = {} as Record<PmsBaseProjectionBindingKey, PmsBaseProjectionBinding>;

  if (isRecord(bindingsValue)) {
    for (const key of Object.keys(bindingsValue)) {
      if (!isPmsBaseProjectionBindingKey(key)) {
        errors.push(`bindings.${key} is not a supported PMS Base projection binding`);
      }
    }

    for (const bindingKey of ALL_BINDING_KEYS) {
      if (!REQUIRED_BINDING_KEYS.includes(bindingKey) && bindingsValue[bindingKey] === undefined) {
        continue;
      }
      const binding = parseBinding(bindingKey, bindingsValue[bindingKey], errors);
      if (binding) {
        bindings[bindingKey] = binding;
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`PMS Base projection registry invalid (${source}): ${errors.join('; ')}`);
  }

  return {
    version: 1,
    policy: policy ?? DEFAULT_POLICY,
    bindings
  };
}

function parseBinding(
  bindingKey: PmsBaseProjectionBindingKey,
  value: unknown,
  errors: string[]
): PmsBaseProjectionBinding | undefined {
  const prefix = `bindings.${bindingKey}`;
  if (!isRecord(value)) {
    errors.push(`${prefix} must be an object`);
    return undefined;
  }

  const enabled = value.enabled;
  if (typeof enabled !== 'boolean') {
    errors.push(`${prefix}.enabled must be boolean`);
  }

  const target = parseTarget(value.target, `${prefix}.target`, errors);
  const fieldMap = parseStringMap(value.fieldMap, `${prefix}.fieldMap`, errors);
  const requiredFields = parseStringArray(value.requiredFields, `${prefix}.requiredFields`, errors, true);
  const updateAllowedFields = parseStringArray(value.updateAllowedFields, `${prefix}.updateAllowedFields`, errors, false);

  if (!fieldMap || !requiredFields || !updateAllowedFields) {
    return undefined;
  }

  for (const businessField of [...requiredFields, ...updateAllowedFields]) {
    if (!fieldMap[businessField]) {
      errors.push(`${prefix}.fieldMap missing mapping for ${businessField}`);
    }
  }

  if (typeof enabled !== 'boolean' || !target) {
    return undefined;
  }

  return {
    bindingKey,
    enabled,
    target,
    fieldMap,
    requiredFields,
    updateAllowedFields
  };
}

function parsePolicy(
  value: unknown,
  path: string,
  errors: string[]
): PmsBaseProjectionBindingPolicy | undefined {
  if (value === undefined) {
    return DEFAULT_POLICY;
  }
  if (!isRecord(value)) {
    errors.push(`${path} must be an object when set`);
    return undefined;
  }

  const validateSchemaByDefault = value.validateSchemaByDefault;
  const rejectUnmappedFields = value.rejectUnmappedFields;
  if (typeof validateSchemaByDefault !== 'boolean') {
    errors.push(`${path}.validateSchemaByDefault must be boolean`);
  }
  if (typeof rejectUnmappedFields !== 'boolean') {
    errors.push(`${path}.rejectUnmappedFields must be boolean`);
  }

  if (typeof validateSchemaByDefault !== 'boolean' || typeof rejectUnmappedFields !== 'boolean') {
    return undefined;
  }

  return {
    validateSchemaByDefault,
    rejectUnmappedFields
  };
}

function parseTarget(value: unknown, path: string, errors: string[]): BitableTableTarget | undefined {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return undefined;
  }

  const appToken = normalizeString(value.appToken);
  const tableId = normalizeString(value.tableId);
  if (!appToken) {
    errors.push(`${path}.appToken must be a non-empty string`);
  }
  if (!tableId) {
    errors.push(`${path}.tableId must be a non-empty string`);
  }

  return appToken && tableId ? { appToken, tableId } : undefined;
}

function parseStringMap(value: unknown, path: string, errors: string[]): Record<string, string> | undefined {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return undefined;
  }

  const result: Record<string, string> = {};
  const entries = Object.entries(value);
  if (entries.length === 0) {
    errors.push(`${path} must contain at least one mapping`);
  }

  for (const [businessField, fieldNameValue] of entries) {
    const fieldName = normalizeString(fieldNameValue);
    if (!businessField.trim()) {
      errors.push(`${path} keys must be non-empty business field names`);
      continue;
    }
    if (!fieldName) {
      errors.push(`${path}.${businessField} must map to a non-empty Feishu field name`);
      continue;
    }
    result[businessField] = fieldName;
  }

  return result;
}

function parseStringArray(
  value: unknown,
  path: string,
  errors: string[],
  requireNonEmpty: boolean
): string[] | undefined {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return undefined;
  }

  const result: string[] = [];
  for (const item of value) {
    const normalized = normalizeString(item);
    if (!normalized) {
      errors.push(`${path} entries must be non-empty strings`);
      continue;
    }
    if (!result.includes(normalized)) {
      result.push(normalized);
    }
  }

  if (requireNonEmpty && result.length === 0) {
    errors.push(`${path} must contain at least one field`);
  }

  return result;
}
