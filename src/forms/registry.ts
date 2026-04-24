import { readFileSync } from 'node:fs';
import type { FeishuFormDefaultTargetConfig } from '../config.js';
import type { JsonRecord, JsonValue } from '../core/contracts.js';

export interface ManagedFormBindingPolicy {
  validateFormSchemaByDefault: boolean;
  rejectUnmappedFields: boolean;
}

export interface ManagedFormBinding {
  formKey: string;
  enabled: boolean;
  target: FeishuFormDefaultTargetConfig;
  fieldMap: Record<string, string>;
  fixedFields: JsonRecord;
  policy: ManagedFormBindingPolicy;
}

export interface ManagedFormRegistry {
  version: 1;
  forms: Record<string, ManagedFormBinding>;
}

export function loadManagedFormRegistry(registryPath: string): ManagedFormRegistry {
  let raw: string;

  try {
    raw = readFileSync(registryPath, 'utf8');
  } catch (error) {
    throw new Error(
      `Failed to load ADAPTER_FEISHU_FORM_REGISTRY_PATH (${registryPath}): ${errorMessage(error)}`
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Invalid ADAPTER_FEISHU_FORM_REGISTRY_PATH JSON (${registryPath}): ${errorMessage(error)}`
    );
  }

  return parseManagedFormRegistry(parsed, registryPath);
}

export function parseManagedFormRegistry(value: unknown, source = 'managed form registry'): ManagedFormRegistry {
  const errors: string[] = [];

  if (!isRecord(value)) {
    throw new Error(`Managed form registry invalid (${source}): root must be an object`);
  }

  if (value.version !== 1) {
    errors.push('version must be 1');
  }

  const formsValue = value.forms;
  if (!isRecord(formsValue)) {
    errors.push('forms must be an object keyed by formKey');
  }

  const forms: Record<string, ManagedFormBinding> = {};

  if (isRecord(formsValue)) {
    const entries = Object.entries(formsValue);
    if (entries.length === 0) {
      errors.push('forms must contain at least one binding');
    }

    for (const [formKey, bindingValue] of entries) {
      const binding = parseManagedFormBinding(formKey, bindingValue, errors);
      if (binding) {
        forms[formKey] = binding;
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Managed form registry invalid (${source}): ${errors.join('; ')}`);
  }

  return {
    version: 1,
    forms
  };
}

function parseManagedFormBinding(
  formKey: string,
  value: JsonValue | undefined,
  errors: string[]
): ManagedFormBinding | undefined {
  const prefix = `forms.${formKey}`;

  if (!formKey.trim()) {
    errors.push('forms keys must be non-empty formKey values');
    return undefined;
  }

  if (!isRecord(value)) {
    errors.push(`${prefix} must be an object`);
    return undefined;
  }

  const enabled = value.enabled;
  if (typeof enabled !== 'boolean') {
    errors.push(`${prefix}.enabled must be boolean`);
  }

  const target = parseTarget(value.target, `${prefix}.target`, errors);
  const fieldMap = parseStringMap(value.fieldMap, `${prefix}.fieldMap`, errors, { requireNonEmpty: true });
  const fixedFields = parseFixedFields(value.fixedFields, `${prefix}.fixedFields`, errors);
  const policy = parsePolicy(value.policy, `${prefix}.policy`, errors);

  if (typeof enabled !== 'boolean' || !target || !fieldMap || !fixedFields || !policy) {
    return undefined;
  }

  return {
    formKey,
    enabled,
    target,
    fieldMap,
    fixedFields,
    policy
  };
}

function parseTarget(
  value: JsonValue | undefined,
  path: string,
  errors: string[]
): FeishuFormDefaultTargetConfig | undefined {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return undefined;
  }

  const appToken = stringValue(value.appToken);
  const tableId = stringValue(value.tableId);
  const formIdValue = value.formId;
  const formId = formIdValue === undefined ? undefined : stringValue(formIdValue);

  if (!appToken) {
    errors.push(`${path}.appToken must be a non-empty string`);
  }
  if (!tableId) {
    errors.push(`${path}.tableId must be a non-empty string`);
  }
  if (formIdValue !== undefined && !formId) {
    errors.push(`${path}.formId must be a non-empty string when set`);
  }

  if (!appToken || !tableId || (formIdValue !== undefined && !formId)) {
    return undefined;
  }

  return {
    appToken,
    tableId,
    ...(formId ? { formId } : {})
  };
}

function parseStringMap(
  value: JsonValue | undefined,
  path: string,
  errors: string[],
  options: { requireNonEmpty: boolean }
): Record<string, string> | undefined {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return undefined;
  }

  const entries = Object.entries(value);
  if (options.requireNonEmpty && entries.length === 0) {
    errors.push(`${path} must contain at least one mapping`);
  }

  const result: Record<string, string> = {};
  for (const [key, mapValue] of entries) {
    const mapped = stringValue(mapValue);
    if (!key.trim()) {
      errors.push(`${path} keys must be non-empty business field names`);
      continue;
    }
    if (!mapped) {
      errors.push(`${path}.${key} must map to a non-empty Feishu field name`);
      continue;
    }
    result[key] = mapped;
  }

  return result;
}

function parseFixedFields(
  value: JsonValue | undefined,
  path: string,
  errors: string[]
): JsonRecord | undefined {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    errors.push(`${path} must be an object when set`);
    return undefined;
  }

  for (const key of Object.keys(value)) {
    if (!key.trim()) {
      errors.push(`${path} keys must be non-empty Feishu field names`);
      return undefined;
    }
  }

  return value;
}

function parsePolicy(
  value: JsonValue | undefined,
  path: string,
  errors: string[]
): ManagedFormBindingPolicy | undefined {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return undefined;
  }

  const validateFormSchemaByDefault = value.validateFormSchemaByDefault;
  const rejectUnmappedFields = value.rejectUnmappedFields;

  if (typeof validateFormSchemaByDefault !== 'boolean') {
    errors.push(`${path}.validateFormSchemaByDefault must be boolean`);
  }
  if (typeof rejectUnmappedFields !== 'boolean') {
    errors.push(`${path}.rejectUnmappedFields must be boolean`);
  }

  if (typeof validateFormSchemaByDefault !== 'boolean' || typeof rejectUnmappedFields !== 'boolean') {
    return undefined;
  }

  return {
    validateFormSchemaByDefault,
    rejectUnmappedFields
  };
}

function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
