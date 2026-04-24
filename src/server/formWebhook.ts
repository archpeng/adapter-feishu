import type { IncomingHttpHeaders } from 'node:http';
import type {
  BitableClient,
  BitableFormField,
  BitableTableField,
  FeishuUserIdType
} from '../channels/feishu/bitableClient.js';
import type { FeishuFormDefaultTargetConfig } from '../config.js';
import type { JsonRecord } from '../core/contracts.js';
import type { AlertDeduper, DedupeKeyInput } from '../state/dedupe.js';
import type { TableWriteQueue } from '../state/tableWriteQueue.js';

const FORM_WEBHOOK_DEDUPE_PROVIDER_KEY = 'form-webhook';
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_FORM_FIELD_PAGE_SIZE = 500;

export interface FormWebhookRequest {
  method?: string;
  pathname?: string;
  headers?: IncomingHttpHeaders;
  rawBody: string;
}

export interface FormWebhookResponse {
  statusCode: number;
  body: Record<string, unknown>;
}

export interface FormWebhookDispatchDeps {
  bitableClient: Pick<BitableClient, 'createRecord'> &
    Partial<Pick<BitableClient, 'getForm' | 'listFormFields' | 'listTableFields'>>;
  authToken?: string;
  defaultTarget?: FeishuFormDefaultTargetConfig;
  allowTargetOverride?: boolean;
  userIdType: FeishuUserIdType;
  deduper?: AlertDeduper;
  tableWriteQueue?: TableWriteQueue;
}

interface FormSchemaValidationSuccess {
  normalizedFields: JsonRecord;
}

interface FormSchemaField {
  aliases: string[];
  canonicalFieldName: string;
  displayName: string;
  required: boolean;
  visible: boolean;
}

export async function dispatchFormWebhookRequest(
  request: FormWebhookRequest,
  deps: FormWebhookDispatchDeps
): Promise<FormWebhookResponse> {
  const pathname = request.pathname ?? '/providers/form-webhook';
  if (pathname !== '/providers/form-webhook') {
    return { statusCode: 404, body: { code: 404, message: 'not_found' } };
  }

  if (request.method !== 'POST') {
    return { statusCode: 405, body: { code: 405, message: 'method_not_allowed' } };
  }

  if (!isAuthorizedFormRequest(request.headers, deps.authToken)) {
    return { statusCode: 401, body: { code: 401, message: 'unauthorized' } };
  }

  const payload = parseJsonRecord(request.rawBody);
  if (!payload) {
    return { statusCode: 400, body: { code: 400, message: 'invalid_json' } };
  }

  const clientToken = stringField(payload, 'clientToken');
  const fields = recordField(payload, 'fields');
  const validateFormSchema = optionalBooleanField(payload, 'validateFormSchema');
  const targetResolution = resolveFormTarget(payload, deps.defaultTarget, deps.allowTargetOverride ?? false);
  const errors = [
    ...validateClientToken(clientToken),
    ...validateFields(fields),
    ...validateBooleanFlag(payload, 'validateFormSchema'),
    ...targetResolution.errors
  ];

  if (
    errors.length > 0 ||
    !clientToken ||
    !fields ||
    validateFormSchema === undefined ||
    !targetResolution.target ||
    !targetResolution.targetSource
  ) {
    return invalidPayloadResponse(errors);
  }

  const target = targetResolution.target;
  const targetSource = targetResolution.targetSource;
  const dedupeInput: DedupeKeyInput = {
    providerKey: FORM_WEBHOOK_DEDUPE_PROVIDER_KEY,
    dedupeKey: `${target.appToken}:${target.tableId}:${clientToken}`
  };

  const executeRecordWrite = async (): Promise<FormWebhookResponse> => {
    if (deps.deduper?.has(dedupeInput)) {
      return duplicateIgnoredResponse(clientToken, targetSource, target);
    }

    let recordFields = fields;

    if (validateFormSchema) {
      const schemaValidationResult = await validateFormSchemaRequest(fields, target, deps);
      if ('statusCode' in schemaValidationResult) {
        return schemaValidationResult;
      }

      recordFields = schemaValidationResult.normalizedFields;
    }

    const result = await deps.bitableClient
      .createRecord({
        appToken: target.appToken,
        tableId: target.tableId,
        clientToken,
        userIdType: deps.userIdType,
        fields: recordFields
      })
      .catch((error: unknown) => {
        return {
          error
        };
      });

    if ('error' in result) {
      return {
        statusCode: 502,
        body: {
          code: 502,
          message: 'record_create_failed',
          error: errorMessage(result.error)
        }
      };
    }

    deps.deduper?.markSeen(dedupeInput);

    return {
      statusCode: 200,
      body: {
        code: 0,
        status: 'record_created',
        ...(result.recordId ? { recordId: result.recordId } : {}),
        clientToken,
        ...(validateFormSchema ? { schemaValidated: true } : {}),
        targetSource,
        target
      }
    };
  };

  return deps.tableWriteQueue ? deps.tableWriteQueue.run(target, executeRecordWrite) : executeRecordWrite();
}

interface FormTargetResolution {
  target?: FeishuFormDefaultTargetConfig;
  targetSource?: 'default' | 'override';
  errors: string[];
}

async function validateFormSchemaRequest(
  fields: JsonRecord,
  target: FeishuFormDefaultTargetConfig,
  deps: FormWebhookDispatchDeps
): Promise<FormSchemaValidationSuccess | FormWebhookResponse> {
  if (!target.formId) {
    return invalidPayloadResponse(['form_id_required_for_schema_validation']);
  }

  if (!deps.bitableClient.getForm || !deps.bitableClient.listFormFields || !deps.bitableClient.listTableFields) {
    return {
      statusCode: 502,
      body: {
        code: 502,
        message: 'schema_validation_failed',
        error: 'schema_validation_not_configured'
      }
    };
  }

  try {
    await deps.bitableClient.getForm({
      appToken: target.appToken,
      tableId: target.tableId,
      formId: target.formId
    });

    const [formFields, tableFields] = await Promise.all([
      listAllFormFields(
        {
          listFormFields: deps.bitableClient.listFormFields
        },
        {
          appToken: target.appToken,
          tableId: target.tableId,
          formId: target.formId
        }
      ),
      listAllTableFields(
        {
          listTableFields: deps.bitableClient.listTableFields
        },
        {
          appToken: target.appToken,
          tableId: target.tableId
        }
      )
    ]);

    const validation = normalizeAndValidateFieldsAgainstFormSchema(fields, formFields, tableFields);

    return validation.errors.length > 0
      ? invalidPayloadResponse(validation.errors)
      : { normalizedFields: validation.normalizedFields };
  } catch (error) {
    return {
      statusCode: 502,
      body: {
        code: 502,
        message: 'schema_validation_failed',
        error: errorMessage(error)
      }
    };
  }
}

async function listAllFormFields(
  bitableClient: Required<Pick<BitableClient, 'listFormFields'>>,
  target: { appToken: string; tableId: string; formId: string }
): Promise<BitableFormField[]> {
  const items: BitableFormField[] = [];
  let pageToken: string | undefined;

  while (true) {
    const page = await bitableClient.listFormFields({
      appToken: target.appToken,
      tableId: target.tableId,
      formId: target.formId,
      pageSize: DEFAULT_FORM_FIELD_PAGE_SIZE,
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

async function listAllTableFields(
  bitableClient: Required<Pick<BitableClient, 'listTableFields'>>,
  target: { appToken: string; tableId: string }
): Promise<BitableTableField[]> {
  const items: BitableTableField[] = [];
  let pageToken: string | undefined;

  while (true) {
    const page = await bitableClient.listTableFields({
      appToken: target.appToken,
      tableId: target.tableId,
      pageSize: DEFAULT_FORM_FIELD_PAGE_SIZE,
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

function normalizeAndValidateFieldsAgainstFormSchema(
  fields: JsonRecord,
  formFields: BitableFormField[],
  tableFields: BitableTableField[]
): { errors: string[]; normalizedFields: JsonRecord } {
  const errors: string[] = [];
  const normalizedFields: JsonRecord = {};
  const schemaFields = buildFormSchemaFields(formFields, tableFields);
  const schemaFieldsByAlias = new Map<string, FormSchemaField>();

  for (const schemaField of schemaFields) {
    for (const alias of schemaField.aliases) {
      if (!schemaFieldsByAlias.has(alias)) {
        schemaFieldsByAlias.set(alias, schemaField);
      }
    }
  }

  for (const schemaField of schemaFields) {
    if (!schemaField.visible || !schemaField.required) {
      continue;
    }

    const hasValue = schemaField.aliases.some((alias) => !isMissingFieldValue(fields[alias]));
    if (!hasValue) {
      errors.push(`required_field_missing:${schemaField.displayName}`);
    }
  }

  for (const submittedField of Object.keys(fields)) {
    const schemaField = schemaFieldsByAlias.get(submittedField);
    if (!schemaField) {
      errors.push(`field_not_in_form:${submittedField}`);
      continue;
    }

    if (!schemaField.visible) {
      errors.push(`field_not_visible:${submittedField}`);
      continue;
    }

    if (!(schemaField.canonicalFieldName in normalizedFields)) {
      normalizedFields[schemaField.canonicalFieldName] = fields[submittedField];
    }
  }

  return { errors, normalizedFields };
}

function buildFormSchemaFields(
  formFields: BitableFormField[],
  tableFields: BitableTableField[]
): FormSchemaField[] {
  const tableFieldNamesById = new Map<string, string>();

  for (const tableField of tableFields) {
    if (tableField.fieldId && tableField.fieldName && !tableFieldNamesById.has(tableField.fieldId)) {
      tableFieldNamesById.set(tableField.fieldId, tableField.fieldName);
    }
  }

  return formFields
    .map((formField) => toFormSchemaField(formField, tableFieldNamesById))
    .filter((field): field is FormSchemaField => Boolean(field));
}

function toFormSchemaField(
  formField: BitableFormField,
  tableFieldNamesById: Map<string, string>
): FormSchemaField | undefined {
  const canonicalFieldName = (formField.fieldId && tableFieldNamesById.get(formField.fieldId)) || formField.title;
  const displayName = formField.title || canonicalFieldName;

  if (!canonicalFieldName || !displayName) {
    return undefined;
  }

  const aliases = [...new Set([canonicalFieldName, formField.title].filter(isNonEmptyString))];
  if (aliases.length === 0) {
    return undefined;
  }

  return {
    aliases,
    canonicalFieldName,
    displayName,
    required: formField.required === true,
    visible: formField.visible !== false
  };
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isMissingFieldValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim().length === 0;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
}

function resolveFormTarget(
  payload: JsonRecord,
  defaultTarget: FeishuFormDefaultTargetConfig | undefined,
  allowTargetOverride: boolean
): FormTargetResolution {
  const targetValue = payload.target;
  if (targetValue === undefined) {
    return defaultTarget
      ? { target: defaultTarget, targetSource: 'default', errors: [] }
      : { errors: ['target_missing'] };
  }

  if (!isRecord(targetValue)) {
    return { errors: ['target_invalid'] };
  }

  if (!allowTargetOverride) {
    return { errors: ['target_override_not_allowed'] };
  }

  const parsedTarget = parseTarget(targetValue);
  if (!parsedTarget.target) {
    return { errors: parsedTarget.errors };
  }

  return {
    target: parsedTarget.target,
    targetSource: 'override',
    errors: []
  };
}

function parseTarget(value: JsonRecord): { target?: FeishuFormDefaultTargetConfig; errors: string[] } {
  const appToken = stringField(value, 'appToken');
  const tableId = stringField(value, 'tableId');
  const formId = optionalStringField(value, 'formId');
  const errors: string[] = [];

  if (!appToken) {
    errors.push('app_token_required');
  }
  if (!tableId) {
    errors.push('table_id_required');
  }
  if (value.formId !== undefined && formId === undefined) {
    errors.push('form_id_invalid');
  }

  if (errors.length > 0 || !appToken || !tableId) {
    return { errors };
  }

  return {
    target: {
      appToken,
      tableId,
      formId
    },
    errors: []
  };
}

function validateClientToken(clientToken: string | undefined): string[] {
  if (!clientToken) {
    return ['client_token_required'];
  }
  return UUID_V4_PATTERN.test(clientToken) ? [] : ['client_token_invalid'];
}

function validateFields(fields: JsonRecord | undefined): string[] {
  return fields ? [] : ['fields_required'];
}

function validateBooleanFlag(value: JsonRecord, key: string): string[] {
  return value[key] === undefined || typeof value[key] === 'boolean' ? [] : [`${toSnakeCase(key)}_invalid`];
}

function parseJsonRecord(rawBody: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return isRecord(parsed) ? (parsed as JsonRecord) : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordField(value: JsonRecord, key: string): JsonRecord | undefined {
  const candidate = value[key];
  return isRecord(candidate) ? (candidate as JsonRecord) : undefined;
}

function stringField(value: JsonRecord, key: string): string | undefined {
  return normalizeString(value[key]);
}

function optionalStringField(value: JsonRecord, key: string): string | undefined {
  const candidate = value[key];
  if (candidate === undefined) {
    return undefined;
  }
  return normalizeString(candidate);
}

function optionalBooleanField(value: JsonRecord, key: string): boolean | undefined {
  const candidate = value[key];
  return typeof candidate === 'boolean' ? candidate : candidate === undefined ? false : undefined;
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isAuthorizedFormRequest(
  headers: IncomingHttpHeaders | undefined,
  expectedToken: string | undefined
): boolean {
  if (!expectedToken) {
    return true;
  }

  const authorization = headerValue(headers, 'authorization');
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length) === expectedToken;
  }

  return headerValue(headers, 'x-adapter-form-token') === expectedToken;
}

function headerValue(headers: IncomingHttpHeaders | undefined, key: string): string | undefined {
  const value = headers?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function invalidPayloadResponse(errors: string[]): FormWebhookResponse {
  return {
    statusCode: 400,
    body: {
      code: 400,
      message: 'invalid_payload',
      errors
    }
  };
}

function duplicateIgnoredResponse(
  clientToken: string,
  targetSource: 'default' | 'override',
  target: FeishuFormDefaultTargetConfig
): FormWebhookResponse {
  return {
    statusCode: 202,
    body: {
      code: 0,
      status: 'duplicate_ignored',
      clientToken,
      targetSource,
      target
    }
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown_error';
}

function toSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
