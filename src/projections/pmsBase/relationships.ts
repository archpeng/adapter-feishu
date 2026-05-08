import type { BitableRecord } from '../../channels/feishu/bitableClient.js';
import { PmsBaseProjectionError } from './errors.js';
import { BITABLE_RECORD_ID_PATTERN, looksLikeUnsafeProjectionStatusText } from './redaction.js';
import {
  errorMessage,
  fieldValueMatches,
  listAllRecords,
  listAllTableFields,
  normalizeString,
  requireBinding,
  toBusinessRecord
} from './shared.js';
import type {
  PmsBaseProjectionBinding,
  PmsBaseProjectionBindingKey,
  PmsBaseProjectionDeps,
  PmsBaseProjectionRelationshipInputs,
  PmsBaseProjectionWarning,
  PmsBaseUpdateProjectionResult
} from './types.js';

export type RelationshipBusinessField = 'relatedRoom' | 'relatedOperationRequest';

export interface RelationshipPlan {
  relationField: RelationshipBusinessField;
  targetBindingKey: PmsBaseProjectionBindingKey;
  targetBusinessField: string;
  targetBusinessValue?: string;
}

export interface RelationshipWriteResult {
  attempted: boolean;
  updatedFields: string[];
  projection: Record<string, unknown>;
  warnings: PmsBaseProjectionWarning[];
}

const RELATION_BUSINESS_FIELDS = new Set(['relatedRoom', 'relatedOperationRequest']);

export function roomRelationshipPlans(
  fields: Record<string, unknown>,
  relationships?: Pick<PmsBaseProjectionRelationshipInputs, 'roomNumber'>
): RelationshipPlan[] {
  const roomNumber = normalizeString(relationships?.roomNumber) ?? normalizeString(fields.roomNumber);
  return roomNumber
    ? [{ relationField: 'relatedRoom', targetBindingKey: 'roomLedger', targetBusinessField: 'roomNumber', targetBusinessValue: roomNumber }]
    : [];
}

export function operationLogRelationshipPlans(
  fields: Record<string, unknown>,
  relationships: PmsBaseProjectionRelationshipInputs | undefined
): RelationshipPlan[] {
  const plans = roomRelationshipPlans(fields, relationships);
  const operationClientToken = normalizeString(relationships?.operationClientToken);
  if (operationClientToken) {
    plans.push({
      relationField: 'relatedOperationRequest',
      targetBindingKey: 'operationRequests',
      targetBusinessField: 'clientToken',
      targetBusinessValue: operationClientToken
    });
  }
  return plans;
}

export function withoutCallerSuppliedRelationshipFields(fields: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(fields)) {
    if (RELATION_BUSINESS_FIELDS.has(field)) {
      throw new PmsBaseProjectionError('invalid_payload', `relationship_field_not_allowed:${field}`);
    }
    result[field] = value;
  }
  return result;
}

export async function writeBestEffortRelationshipFields(
  deps: PmsBaseProjectionDeps,
  sourceBinding: PmsBaseProjectionBinding,
  sourceRecord: BitableRecord,
  plans: RelationshipPlan[]
): Promise<RelationshipWriteResult> {
  const resolved = await resolveRelationshipFields(deps, sourceBinding, plans);
  if (Object.keys(resolved.fields).length === 0) {
    return {
      attempted: resolved.attempted,
      updatedFields: [],
      projection: {},
      warnings: resolved.warnings
    };
  }

  const recordId = sourceRecord.recordId;
  if (!recordId) {
    return {
      attempted: true,
      updatedFields: [],
      projection: {},
      warnings: [
        ...resolved.warnings,
        relationWarning('linked_record_source_record_id_missing', 'source_record_id_missing_for_linked_record_update')
      ]
    };
  }

  try {
    const updated = await deps.bitableClient.updateRecord({
      ...sourceBinding.target,
      recordId,
      fields: resolved.fields
    });

    return {
      attempted: true,
      updatedFields: resolved.updatedFields,
      projection: toBusinessRecord(updated, sourceBinding),
      warnings: resolved.warnings
    };
  } catch (error) {
    return {
      attempted: true,
      updatedFields: [],
      projection: {},
      warnings: [
        ...resolved.warnings,
        relationWarning('linked_record_update_failed', `linked_record_update_failed:${errorMessage(error)}`)
      ]
    };
  }
}

export function withRelationshipResult(
  result: PmsBaseUpdateProjectionResult,
  relationResult: RelationshipWriteResult
): PmsBaseUpdateProjectionResult {
  if (!relationResult.attempted) {
    return result;
  }

  return {
    ...result,
    relationStatus: relationResult.warnings.length > 0 ? 'stale' : 'fresh',
    warnings: relationResult.warnings
  };
}

async function resolveRelationshipFields(
  deps: PmsBaseProjectionDeps,
  sourceBinding: PmsBaseProjectionBinding,
  plans: RelationshipPlan[]
): Promise<{ attempted: boolean; fields: Record<string, unknown>; updatedFields: RelationshipBusinessField[]; warnings: PmsBaseProjectionWarning[] }> {
  const fields: Record<string, unknown> = {};
  const updatedFields: RelationshipBusinessField[] = [];
  const warnings: PmsBaseProjectionWarning[] = [];
  let attempted = false;

  for (const plan of plans) {
    const businessValue = normalizeString(plan.targetBusinessValue);
    if (!businessValue) {
      continue;
    }
    attempted = true;

    if (BITABLE_RECORD_ID_PATTERN.test(businessValue)) {
      warnings.push(relationWarning(
        'relationship_business_key_rejected_record_id_shape',
        `relationship_business_key_rejected_record_id_shape:${plan.relationField}`,
        plan
      ));
      continue;
    }

    if (looksLikeUnsafeProjectionStatusText(businessValue)) {
      warnings.push(relationWarning(
        'relationship_business_key_rejected_unsafe_value',
        `relationship_business_key_rejected_unsafe_value:${plan.relationField}`,
        plan
      ));
      continue;
    }

    const sourceFieldName = sourceBinding.fieldMap[plan.relationField];
    if (!sourceFieldName) {
      warnings.push(relationWarning(
        'linked_record_field_mapping_missing',
        `linked_record_field_mapping_missing:${sourceBinding.bindingKey}:${plan.relationField}`,
        plan,
        businessValue
      ));
      continue;
    }

    if (!(await tableHasMappedField(deps, sourceBinding, plan.relationField))) {
      warnings.push(relationWarning(
        'linked_record_field_missing',
        `linked_record_field_missing:${sourceBinding.bindingKey}:${plan.relationField}`,
        plan,
        businessValue
      ));
      continue;
    }

    let targetBinding: PmsBaseProjectionBinding;
    try {
      targetBinding = requireBinding(deps.registry, plan.targetBindingKey);
    } catch (error) {
      warnings.push(relationWarning(
        'linked_record_target_unavailable',
        `linked_record_target_unavailable:${plan.targetBindingKey}:${errorMessage(error)}`,
        plan,
        businessValue
      ));
      continue;
    }

    const targetFieldName = targetBinding.fieldMap[plan.targetBusinessField];
    if (!targetFieldName) {
      warnings.push(relationWarning(
        'linked_record_target_field_mapping_missing',
        `linked_record_target_field_mapping_missing:${plan.targetBindingKey}:${plan.targetBusinessField}`,
        plan,
        businessValue
      ));
      continue;
    }

    if (!(await tableHasMappedField(deps, targetBinding, plan.targetBusinessField))) {
      warnings.push(relationWarning(
        'linked_record_target_field_missing',
        `linked_record_target_field_missing:${plan.targetBindingKey}:${plan.targetBusinessField}`,
        plan,
        businessValue
      ));
      continue;
    }

    const records = await listAllRecords(deps, targetBinding.target);
    const matches = records.filter((record) => fieldValueMatches(record.fields[targetFieldName], businessValue));
    if (matches.length === 0) {
      warnings.push(relationWarning(
        'linked_record_related_record_missing',
        `linked_record_related_record_missing:${plan.targetBindingKey}:${plan.targetBusinessField}`,
        plan,
        businessValue
      ));
      continue;
    }
    if (matches.length > 1) {
      warnings.push(relationWarning(
        'linked_record_related_record_duplicate',
        `linked_record_related_record_duplicate:${plan.targetBindingKey}:${plan.targetBusinessField}`,
        plan,
        businessValue
      ));
      continue;
    }

    const recordId = matches[0].recordId;
    if (!recordId) {
      warnings.push(relationWarning(
        'linked_record_related_record_id_missing',
        `linked_record_related_record_id_missing:${plan.targetBindingKey}:${plan.targetBusinessField}`,
        plan,
        businessValue
      ));
      continue;
    }

    fields[sourceFieldName] = [recordId];
    updatedFields.push(plan.relationField);
  }

  return { attempted, fields, updatedFields, warnings };
}

async function tableHasMappedField(
  deps: PmsBaseProjectionDeps,
  binding: PmsBaseProjectionBinding,
  businessField: string
): Promise<boolean> {
  if (deps.validateSchema === false || deps.registry.policy.validateSchemaByDefault === false) {
    return true;
  }

  const fieldName = binding.fieldMap[businessField];
  if (!fieldName) {
    return false;
  }

  const tableFields = await listAllTableFields(deps, binding.target);
  return tableFields.some((field) => field.fieldName === fieldName);
}

function relationWarning(
  code: string,
  message: string,
  plan?: RelationshipPlan,
  businessValue?: string
): PmsBaseProjectionWarning {
  return {
    code,
    message,
    ...(plan ? { relationField: plan.relationField, targetBindingKey: plan.targetBindingKey, businessField: plan.targetBusinessField } : {}),
    ...(businessValue ? { businessValue } : {})
  };
}
