import { readFileSync } from 'node:fs';
import type {
  BitableClient,
  BitableRecord,
  BitableTableField,
  BitableTableTarget
} from '../channels/feishu/bitableClient.js';

export const PMS_BASE_PROJECTION_SCHEMA_VERSION = 'pms-dashboard-mvp-v1';

export type PmsBaseProjectionBindingKey =
  | 'roomLedger'
  | 'operationRequests'
  | 'housekeepingTasks'
  | 'maintenanceTickets'
  | 'reservations'
  | 'stays'
  | 'inventoryCalendar'
  | 'operationLogs'
  | 'projectionStatus';

export interface PmsBaseProjectionBindingPolicy {
  validateSchemaByDefault: boolean;
  rejectUnmappedFields: boolean;
}

export interface PmsBaseProjectionBinding {
  bindingKey: PmsBaseProjectionBindingKey;
  enabled: boolean;
  target: BitableTableTarget;
  fieldMap: Record<string, string>;
  requiredFields: string[];
  updateAllowedFields: string[];
}

export interface PmsBaseProjectionRegistry {
  version: 1;
  policy: PmsBaseProjectionBindingPolicy;
  bindings: Record<PmsBaseProjectionBindingKey, PmsBaseProjectionBinding>;
}

export type PmsBaseProjectionRelationStatus = 'fresh' | 'stale';

export interface PmsBaseProjectionRelationshipInputs {
  roomNumber?: string;
  operationClientToken?: string;
}

export interface PmsBaseProjectionWarning {
  code: string;
  message: string;
  relationField?: 'relatedRoom' | 'relatedOperationRequest';
  targetBindingKey?: PmsBaseProjectionBindingKey;
  businessField?: string;
  businessValue?: string;
}

export interface PmsBaseProjectionDeps {
  bitableClient: Pick<BitableClient, 'createRecord' | 'listRecords' | 'updateRecord' | 'listTableFields'>;
  registry: PmsBaseProjectionRegistry;
  now?: () => string;
  validateSchema?: boolean;
}

export interface PmsBaseGetRoomProjectionRequest {
  roomNumber: string;
}

export interface PmsBaseDashboardProjectionRequest {
  generatedAt?: string;
}

export interface PmsBaseUpdateOperationResultRequest {
  clientToken: string;
  fields: Record<string, unknown>;
}

export interface PmsBaseUpsertOperationRequestRequest {
  clientToken: string;
  fields: Record<string, unknown>;
}

export interface PmsBaseUpdateRoomProjectionRequest {
  roomNumber: string;
  fields: Record<string, unknown>;
}

export interface PmsBaseUpsertRoomProjectionRequest {
  roomNumber: string;
  fields: Record<string, unknown>;
}

export interface PmsBaseAppendOperationLogRequest {
  auditId: string;
  fields: Record<string, unknown>;
  relationships?: PmsBaseProjectionRelationshipInputs;
}

export interface PmsBaseUpsertHousekeepingTaskProjectionRequest {
  taskId: string;
  fields: Record<string, unknown>;
  relationships?: Pick<PmsBaseProjectionRelationshipInputs, 'roomNumber'>;
}

export interface PmsBaseUpsertMaintenanceTicketProjectionRequest {
  ticketId: string;
  fields: Record<string, unknown>;
  relationships?: Pick<PmsBaseProjectionRelationshipInputs, 'roomNumber'>;
}

export interface PmsBaseGetReservationProjectionRequest {
  reservationCode: string;
}

export interface PmsBaseTodayReservationsProjectionRequest {
  businessDate: string;
}

export interface PmsBaseUpsertReservationProjectionRequest {
  reservationCode: string;
  fields: Record<string, unknown>;
  relationships?: Pick<PmsBaseProjectionRelationshipInputs, 'roomNumber'>;
}

export interface PmsBaseUpsertStayProjectionRequest {
  stayId: string;
  fields: Record<string, unknown>;
  relationships?: Pick<PmsBaseProjectionRelationshipInputs, 'roomNumber'>;
}

export interface PmsBaseUpsertInventoryCalendarProjectionRequest {
  intervalKey: string;
  fields: Record<string, unknown>;
  relationships?: Pick<PmsBaseProjectionRelationshipInputs, 'roomNumber'>;
}

export interface PmsBasePruneInventoryCalendarProjectionRequest {
  intervalKey: string;
  fields?: Record<string, unknown>;
}

export interface PmsBaseUpsertProjectionStatusRequest {
  projectionKey: string;
  fields: Record<string, unknown>;
}

export interface PmsBasePruneProjectionStatusRequest {
  projectionKey: string;
  fields?: Record<string, unknown>;
}

export interface PmsBaseRoomProjectionResult {
  operation: 'pms_base_get_room_projection';
  schemaVersion: typeof PMS_BASE_PROJECTION_SCHEMA_VERSION;
  room: Record<string, unknown>;
  projectionFreshness: 'Fresh';
}

export interface PmsBaseDashboardProjectionResult {
  operation: 'pms_base_dashboard_projection';
  schemaVersion: typeof PMS_BASE_PROJECTION_SCHEMA_VERSION;
  generatedAt: string;
  summary: {
    summaryStatus: 'Fresh';
    totalRooms: number;
    vacantClean: number;
    vacantDirty: number;
    inHouse: number;
    dueOut: number;
    stopSell: number;
    cleaningQueue: number;
    inspectionQueue: number;
    pendingOperationRequests: number;
    failedOperationRequests: number;
    projectionFreshness: 'base_projection_read';
  };
  rooms: Record<string, unknown>[];
}

export interface PmsBaseUpdateProjectionResult {
  operation:
    | 'pms_base_upsert_operation_request'
    | 'pms_base_update_operation_result'
    | 'pms_base_upsert_room_projection'
    | 'pms_base_update_room_projection'
    | 'pms_base_append_operation_log'
    | 'pms_base_upsert_housekeeping_task_projection'
    | 'pms_base_upsert_maintenance_ticket_projection'
    | 'pms_base_upsert_reservation_projection'
    | 'pms_base_upsert_stay_projection'
    | 'pms_base_upsert_inventory_calendar_projection'
    | 'pms_base_prune_inventory_calendar_projection'
    | 'pms_base_upsert_projection_status'
    | 'pms_base_prune_projection_status';
  schemaVersion: typeof PMS_BASE_PROJECTION_SCHEMA_VERSION;
  status: 'created' | 'updated' | 'pruned';
  updatedFields: string[];
  projection: Record<string, unknown>;
  relationStatus?: PmsBaseProjectionRelationStatus;
  warnings?: PmsBaseProjectionWarning[];
}

export interface PmsBaseReservationProjectionResult {
  operation: 'pms_base_get_reservation_projection';
  schemaVersion: typeof PMS_BASE_PROJECTION_SCHEMA_VERSION;
  reservation: Record<string, unknown>;
  projectionFreshness: 'Fresh';
}

export interface PmsBaseReservationListProjectionResult {
  operation: 'pms_base_today_arrivals_projection' | 'pms_base_today_departures_projection';
  schemaVersion: typeof PMS_BASE_PROJECTION_SCHEMA_VERSION;
  businessDate: string;
  reservations: Record<string, unknown>[];
  projectionFreshness: 'Fresh';
}

export class PmsBaseProjectionError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'PmsBaseProjectionError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

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
const DEFAULT_RECORD_PAGE_SIZE = 500;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BITABLE_RECORD_ID_PATTERN = /\b(?:rec_[a-zA-Z0-9_/-]{3,}|rec[a-zA-Z0-9]{12,})\b/;
const TRACKED_TARGET_ID_PATTERN = /\b(?:bascn|tbl|fld|vew|form|rec)(?=[a-zA-Z0-9]{12,}\b)(?=[a-zA-Z0-9]*\d)[a-zA-Z0-9]{12,}\b/;
const RAW_TARGET_KEY_PATTERN = /^(target|appToken|tableId|formId|recordId|callbackUrl|callbackURL|token|authToken)$/;
const CALLBACK_URL_PATTERN = /https?:\/\/[^\s`"']*(?:callback|webhook|feishu|lark|bitable)[^\s`"']*/gi;
const SECRET_ASSIGNMENT_PATTERN = /\b(?:appToken|tableId|formId|recordId|callback|tenantId|tenant|token|secret|authorization)\b\s*[:=]\s*[^\s,;]+/gi;
const RELATION_BUSINESS_FIELDS = new Set(['relatedRoom', 'relatedOperationRequest']);
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

export async function pms_base_get_room_projection(
  request: PmsBaseGetRoomProjectionRequest,
  deps: PmsBaseProjectionDeps
): Promise<PmsBaseRoomProjectionResult> {
  const roomNumber = normalizeString(request.roomNumber);
  if (!roomNumber) {
    throw new PmsBaseProjectionError('invalid_payload', 'room_number_required');
  }

  const binding = requireBinding(deps.registry, 'roomLedger');
  await assertSchemaFields(deps, binding, uniqueFields(['roomNumber', ...binding.requiredFields]));
  const record = await findUniqueRecordByBusinessField(deps, binding, 'roomNumber', roomNumber, {
    notFoundCode: 'room_projection_not_found',
    duplicateCode: 'duplicate_room_number'
  });

  return {
    operation: 'pms_base_get_room_projection',
    schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
    room: toBusinessRecord(record, binding),
    projectionFreshness: 'Fresh'
  };
}

export async function pms_base_dashboard_projection(
  request: PmsBaseDashboardProjectionRequest,
  deps: PmsBaseProjectionDeps
): Promise<PmsBaseDashboardProjectionResult> {
  const roomBinding = requireBinding(deps.registry, 'roomLedger');
  const operationBinding = requireBinding(deps.registry, 'operationRequests');
  await assertSchemaFields(deps, roomBinding, uniqueFields([...roomBinding.requiredFields]));
  await assertSchemaFields(deps, operationBinding, uniqueFields(['clientToken', 'status', ...operationBinding.requiredFields]));

  const [roomRecords, operationRecords] = await Promise.all([
    listAllRecords(deps, roomBinding.target),
    listAllRecords(deps, operationBinding.target)
  ]);
  const rooms = roomRecords.map((record) => toBusinessRecord(record, roomBinding));
  const operations = operationRecords.map((record) => toBusinessRecord(record, operationBinding));

  return {
    operation: 'pms_base_dashboard_projection',
    schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
    generatedAt: normalizeString(request.generatedAt) ?? deps.now?.() ?? new Date().toISOString(),
    summary: {
      summaryStatus: 'Fresh',
      totalRooms: rooms.length,
      vacantClean: rooms.filter((room) => statusIn(room.occupancyStatus, ['Vacant', '空房']) && statusIn(room.cleaningStatus, ['Clean', '干净'])).length,
      vacantDirty: rooms.filter((room) => statusIn(room.occupancyStatus, ['Vacant', '空房']) && statusIn(room.cleaningStatus, ['Dirty', '脏房'])).length,
      inHouse: rooms.filter((room) => statusIn(room.occupancyStatus, ['InHouse', '在住'])).length,
      dueOut: rooms.filter((room) => statusIn(room.occupancyStatus, ['DueOut', '预离'])).length,
      stopSell: rooms.filter((room) => statusIn(room.sellableStatus, ['StopSell', '停售维修', '停售保留', '停售业主'])).length,
      cleaningQueue: rooms.filter((room) => statusIn(room.cleaningStatus, ['Cleaning', 'Dirty', 'Rework', '清洁中', '脏房', '返工'])).length,
      inspectionQueue: rooms.filter((room) => statusIn(room.cleaningStatus, ['Inspection', '待查'])).length,
      pendingOperationRequests: operations.filter((operation) =>
        statusIn(operation.status, ['Pending', 'DryRunReady', 'Confirmed', '待处理', '待确认', '处理中', '需人工复核'])
      ).length,
      failedOperationRequests: operations.filter((operation) => statusIn(operation.status, ['Failed', '失败'])).length,
      projectionFreshness: 'base_projection_read'
    },
    rooms
  };
}

export async function pms_base_update_operation_result(
  request: PmsBaseUpdateOperationResultRequest,
  deps: PmsBaseProjectionDeps
): Promise<PmsBaseUpdateProjectionResult> {
  const clientToken = normalizeString(request.clientToken);
  if (!clientToken) {
    throw new PmsBaseProjectionError('invalid_payload', 'client_token_required');
  }

  const binding = requireBinding(deps.registry, 'operationRequests');
  const updateFields = mapUpdateFields(binding, request.fields);
  await assertSchemaFields(deps, binding, uniqueFields(['clientToken', ...Object.keys(request.fields)]));
  const record = await findUniqueRecordByBusinessField(deps, binding, 'clientToken', clientToken, {
    notFoundCode: 'operation_projection_not_found',
    duplicateCode: 'duplicate_client_token'
  });
  const recordId = requireRecordId(record, 'operation_projection_record_id_missing');
  const updated = await deps.bitableClient.updateRecord({
    ...binding.target,
    recordId,
    fields: updateFields
  });

  return {
    operation: 'pms_base_update_operation_result',
    schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
    status: 'updated',
    updatedFields: Object.keys(request.fields),
    projection: toBusinessRecord(updated, binding)
  };
}

export async function pms_base_upsert_operation_request(
  request: PmsBaseUpsertOperationRequestRequest,
  deps: PmsBaseProjectionDeps
): Promise<PmsBaseUpdateProjectionResult> {
  const clientToken = normalizeString(request.clientToken);
  if (!clientToken) {
    throw new PmsBaseProjectionError('invalid_payload', 'client_token_required');
  }

  const binding = requireBinding(deps.registry, 'operationRequests');
  const createBusinessFields = {
    clientToken,
    ...request.fields
  };
  await assertSchemaFields(deps, binding, uniqueFields(['clientToken', ...Object.keys(request.fields)]));
  const existing = await findOptionalUniqueRecordByBusinessField(deps, binding, 'clientToken', clientToken, {
    duplicateCode: 'duplicate_client_token'
  });

  if (existing) {
    const updateBusinessFields = pickAllowedFields(binding.updateAllowedFields, request.fields);
    const updateFields = mapUpdateFields(binding, updateBusinessFields);
    const recordId = requireRecordId(existing, 'operation_projection_record_id_missing');
    const updated = await deps.bitableClient.updateRecord({
      ...binding.target,
      recordId,
      fields: updateFields
    });

    return {
      operation: 'pms_base_upsert_operation_request',
      schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
      status: 'updated',
      updatedFields: Object.keys(updateBusinessFields),
      projection: toBusinessRecord(updated, binding)
    };
  }

  const createFields = mapCreateFields(binding, createBusinessFields);
  assertRequiredCreateFields(binding, createBusinessFields);
  const created = await deps.bitableClient.createRecord({
    ...binding.target,
    ...(UUID_V4_PATTERN.test(clientToken) ? { clientToken } : {}),
    fields: createFields
  });

  return {
    operation: 'pms_base_upsert_operation_request',
    schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
    status: 'created',
    updatedFields: Object.keys(createBusinessFields),
    projection: toBusinessRecord(created, binding)
  };
}

export async function pms_base_update_room_projection(
  request: PmsBaseUpdateRoomProjectionRequest,
  deps: PmsBaseProjectionDeps
): Promise<PmsBaseUpdateProjectionResult> {
  const roomNumber = normalizeString(request.roomNumber);
  if (!roomNumber) {
    throw new PmsBaseProjectionError('invalid_payload', 'room_number_required');
  }

  const binding = requireBinding(deps.registry, 'roomLedger');
  const updateFields = mapUpdateFields(binding, request.fields);
  await assertSchemaFields(deps, binding, uniqueFields(['roomNumber', ...Object.keys(request.fields)]));
  const record = await findUniqueRecordByBusinessField(deps, binding, 'roomNumber', roomNumber, {
    notFoundCode: 'room_projection_not_found',
    duplicateCode: 'duplicate_room_number'
  });
  const recordId = requireRecordId(record, 'room_projection_record_id_missing');
  const updated = await deps.bitableClient.updateRecord({
    ...binding.target,
    recordId,
    fields: updateFields
  });

  return {
    operation: 'pms_base_update_room_projection',
    schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
    status: 'updated',
    updatedFields: Object.keys(request.fields),
    projection: toBusinessRecord(updated, binding)
  };
}

export async function pms_base_upsert_room_projection(
  request: PmsBaseUpsertRoomProjectionRequest,
  deps: PmsBaseProjectionDeps
): Promise<PmsBaseUpdateProjectionResult> {
  const roomNumber = normalizeString(request.roomNumber);
  if (!roomNumber) {
    throw new PmsBaseProjectionError('invalid_payload', 'room_number_required');
  }

  const binding = requireBinding(deps.registry, 'roomLedger');
  const createBusinessFields = {
    roomNumber,
    ...request.fields
  };
  await assertSchemaFields(deps, binding, uniqueFields(['roomNumber', ...Object.keys(request.fields)]));
  const existing = await findOptionalUniqueRecordByBusinessField(deps, binding, 'roomNumber', roomNumber, {
    duplicateCode: 'duplicate_room_number'
  });

  if (existing) {
    const updateBusinessFields = pickAllowedFields(binding.updateAllowedFields, request.fields);
    const updateFields = mapUpdateFields(binding, updateBusinessFields);
    const recordId = requireRecordId(existing, 'room_projection_record_id_missing');
    const updated = await deps.bitableClient.updateRecord({
      ...binding.target,
      recordId,
      fields: updateFields
    });

    return {
      operation: 'pms_base_upsert_room_projection',
      schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
      status: 'updated',
      updatedFields: Object.keys(updateBusinessFields),
      projection: toBusinessRecord(updated, binding)
    };
  }

  const createFields = mapCreateFields(binding, createBusinessFields);
  assertRequiredCreateFields(binding, createBusinessFields);
  const created = await deps.bitableClient.createRecord({
    ...binding.target,
    fields: createFields
  });

  return {
    operation: 'pms_base_upsert_room_projection',
    schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
    status: 'created',
    updatedFields: Object.keys(createBusinessFields),
    projection: toBusinessRecord(created, binding)
  };
}

export async function pms_base_append_operation_log(
  request: PmsBaseAppendOperationLogRequest,
  deps: PmsBaseProjectionDeps
): Promise<PmsBaseUpdateProjectionResult> {
  const auditId = normalizeString(request.auditId);
  if (!auditId) {
    throw new PmsBaseProjectionError('invalid_payload', 'audit_id_required');
  }

  const binding = requireBinding(deps.registry, 'operationLogs');
  const coreFields = withoutCallerSuppliedRelationshipFields(request.fields);
  const relationshipPlans = operationLogRelationshipPlans(coreFields, request.relationships);
  const createBusinessFields = {
    auditId,
    ...coreFields
  };
  await assertSchemaFields(deps, binding, uniqueFields(['auditId', ...Object.keys(coreFields)]));
  const existing = await findOptionalUniqueRecordByBusinessField(deps, binding, 'auditId', auditId, {
    duplicateCode: 'duplicate_audit_id'
  });
  if (existing) {
    const relationResult = await writeBestEffortRelationshipFields(deps, binding, existing, relationshipPlans);
    return withRelationshipResult({
      operation: 'pms_base_append_operation_log',
      schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
      status: 'updated',
      updatedFields: relationResult.updatedFields,
      projection: {
        ...toBusinessRecord(existing, binding),
        ...relationResult.projection
      }
    }, relationResult);
  }

  const createFields = mapCreateFields(binding, createBusinessFields);
  assertRequiredCreateFields(binding, createBusinessFields);
  const created = await deps.bitableClient.createRecord({
    ...binding.target,
    fields: createFields
  });
  const relationResult = await writeBestEffortRelationshipFields(deps, binding, created, relationshipPlans);

  return withRelationshipResult({
    operation: 'pms_base_append_operation_log',
    schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
    status: 'created',
    updatedFields: [...Object.keys(createBusinessFields), ...relationResult.updatedFields],
    projection: {
      ...toBusinessRecord(created, binding),
      ...relationResult.projection
    }
  }, relationResult);
}

export async function pms_base_upsert_housekeeping_task_projection(
  request: PmsBaseUpsertHousekeepingTaskProjectionRequest,
  deps: PmsBaseProjectionDeps
): Promise<PmsBaseUpdateProjectionResult> {
  const taskId = normalizeString(request.taskId);
  if (!taskId) {
    throw new PmsBaseProjectionError('invalid_payload', 'task_id_required');
  }

  return upsertProjectionByBusinessField({
    deps,
    bindingKey: 'housekeepingTasks',
    uniqueBusinessField: 'taskId',
    uniqueValue: taskId,
    fields: request.fields,
    relationships: roomRelationshipPlans(request.fields, request.relationships),
    duplicateCode: 'duplicate_housekeeping_task_id',
    recordIdMissingCode: 'housekeeping_task_projection_record_id_missing',
    operation: 'pms_base_upsert_housekeeping_task_projection'
  });
}

export async function pms_base_upsert_maintenance_ticket_projection(
  request: PmsBaseUpsertMaintenanceTicketProjectionRequest,
  deps: PmsBaseProjectionDeps
): Promise<PmsBaseUpdateProjectionResult> {
  const ticketId = normalizeString(request.ticketId);
  if (!ticketId) {
    throw new PmsBaseProjectionError('invalid_payload', 'ticket_id_required');
  }

  return upsertProjectionByBusinessField({
    deps,
    bindingKey: 'maintenanceTickets',
    uniqueBusinessField: 'ticketId',
    uniqueValue: ticketId,
    fields: request.fields,
    relationships: roomRelationshipPlans(request.fields, request.relationships),
    duplicateCode: 'duplicate_maintenance_ticket_id',
    recordIdMissingCode: 'maintenance_ticket_projection_record_id_missing',
    operation: 'pms_base_upsert_maintenance_ticket_projection'
  });
}

export async function pms_base_get_reservation_projection(
  request: PmsBaseGetReservationProjectionRequest,
  deps: PmsBaseProjectionDeps
): Promise<PmsBaseReservationProjectionResult> {
  const reservationCode = normalizeString(request.reservationCode);
  if (!reservationCode) {
    throw new PmsBaseProjectionError('invalid_payload', 'reservation_code_required');
  }

  const binding = requireBinding(deps.registry, 'reservations');
  await assertSchemaFields(deps, binding, uniqueFields(['reservationCode', ...binding.requiredFields]));
  const record = await findUniqueRecordByBusinessField(deps, binding, 'reservationCode', reservationCode, {
    notFoundCode: 'reservation_projection_not_found',
    duplicateCode: 'duplicate_reservation_code'
  });

  return {
    operation: 'pms_base_get_reservation_projection',
    schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
    reservation: toBusinessRecord(record, binding),
    projectionFreshness: 'Fresh'
  };
}

export async function pms_base_upsert_reservation_projection(
  request: PmsBaseUpsertReservationProjectionRequest,
  deps: PmsBaseProjectionDeps
): Promise<PmsBaseUpdateProjectionResult> {
  const reservationCode = normalizeString(request.reservationCode);
  if (!reservationCode) {
    throw new PmsBaseProjectionError('invalid_payload', 'reservation_code_required');
  }

  return upsertProjectionByBusinessField({
    deps,
    bindingKey: 'reservations',
    uniqueBusinessField: 'reservationCode',
    uniqueValue: reservationCode,
    fields: request.fields,
    relationships: roomRelationshipPlans(request.fields, request.relationships),
    duplicateCode: 'duplicate_reservation_code',
    recordIdMissingCode: 'reservation_projection_record_id_missing',
    operation: 'pms_base_upsert_reservation_projection'
  });
}

export async function pms_base_upsert_stay_projection(
  request: PmsBaseUpsertStayProjectionRequest,
  deps: PmsBaseProjectionDeps
): Promise<PmsBaseUpdateProjectionResult> {
  const stayId = normalizeString(request.stayId);
  if (!stayId) {
    throw new PmsBaseProjectionError('invalid_payload', 'stay_id_required');
  }

  return upsertProjectionByBusinessField({
    deps,
    bindingKey: 'stays',
    uniqueBusinessField: 'backendId',
    uniqueValue: stayId,
    fields: request.fields,
    relationships: roomRelationshipPlans(request.fields, request.relationships),
    duplicateCode: 'duplicate_stay_id',
    recordIdMissingCode: 'stay_projection_record_id_missing',
    operation: 'pms_base_upsert_stay_projection'
  });
}

export async function pms_base_upsert_inventory_calendar_projection(
  request: PmsBaseUpsertInventoryCalendarProjectionRequest,
  deps: PmsBaseProjectionDeps
): Promise<PmsBaseUpdateProjectionResult> {
  const intervalKey = normalizeString(request.intervalKey);
  if (!intervalKey) {
    throw new PmsBaseProjectionError('invalid_payload', 'interval_key_required');
  }

  return upsertProjectionByBusinessField({
    deps,
    bindingKey: 'inventoryCalendar',
    uniqueBusinessField: 'intervalKey',
    uniqueValue: intervalKey,
    fields: request.fields,
    relationships: roomRelationshipPlans(request.fields, request.relationships),
    duplicateCode: 'duplicate_inventory_interval_key',
    recordIdMissingCode: 'inventory_calendar_projection_record_id_missing',
    operation: 'pms_base_upsert_inventory_calendar_projection'
  });
}

export async function pms_base_prune_inventory_calendar_projection(
  request: PmsBasePruneInventoryCalendarProjectionRequest,
  deps: PmsBaseProjectionDeps
): Promise<PmsBaseUpdateProjectionResult> {
  const intervalKey = normalizeString(request.intervalKey);
  if (!intervalKey) {
    throw new PmsBaseProjectionError('invalid_payload', 'interval_key_required');
  }

  const binding = requireBinding(deps.registry, 'inventoryCalendar');
  const basePruneFields = request.fields ?? {};
  const prunedAt = basePruneFields.prunedAt ?? deps.now?.() ?? new Date().toISOString();
  const pruneBusinessFields = {
    ...basePruneFields,
    projectionStatus: 'Pruned',
    prunedAt,
    schemaVersion: basePruneFields.schemaVersion ?? PMS_BASE_PROJECTION_SCHEMA_VERSION
  };
  await assertSchemaFields(deps, binding, uniqueFields(['intervalKey', ...Object.keys(pruneBusinessFields)]));
  const existing = await findOptionalUniqueRecordByBusinessField(deps, binding, 'intervalKey', intervalKey, {
    duplicateCode: 'duplicate_inventory_interval_key'
  });

  if (!existing) {
    return {
      operation: 'pms_base_prune_inventory_calendar_projection',
      schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
      status: 'pruned',
      updatedFields: [],
      projection: {
        intervalKey,
        projectionStatus: 'Pruned',
        prunedAt,
        schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
      }
    };
  }

  const updateFields = mapUpdateFields(binding, pruneBusinessFields);
  const recordId = requireRecordId(existing, 'inventory_calendar_projection_record_id_missing');
  const updated = await deps.bitableClient.updateRecord({
    ...binding.target,
    recordId,
    fields: updateFields
  });

  return {
    operation: 'pms_base_prune_inventory_calendar_projection',
    schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
    status: 'pruned',
    updatedFields: Object.keys(pruneBusinessFields),
    projection: toBusinessRecord(updated, binding)
  };
}

export async function pms_base_upsert_projection_status(
  request: PmsBaseUpsertProjectionStatusRequest,
  deps: PmsBaseProjectionDeps
): Promise<PmsBaseUpdateProjectionResult> {
  const projectionKey = normalizeString(request.projectionKey);
  if (!projectionKey) {
    throw new PmsBaseProjectionError('invalid_payload', 'projection_key_required');
  }

  const binding = requireBinding(deps.registry, 'projectionStatus');
  const coreFields = sanitizeProjectionStatusFields(request.fields);
  const createBusinessFields = {
    backendId: projectionKey,
    ...coreFields
  };
  await assertSchemaFields(deps, binding, uniqueFields(['backendId', ...Object.keys(coreFields)]));
  const existing = await findOptionalUniqueRecordByBusinessField(deps, binding, 'backendId', projectionKey, {
    duplicateCode: 'duplicate_projection_status_key'
  });

  if (existing) {
    const updateBusinessFields = pickAllowedFields(binding.updateAllowedFields, coreFields);
    const updateFields = mapUpdateFields(binding, updateBusinessFields);
    const recordId = requireRecordId(existing, 'projection_status_record_id_missing');
    const updated = await deps.bitableClient.updateRecord({
      ...binding.target,
      recordId,
      fields: updateFields
    });

    return {
      operation: 'pms_base_upsert_projection_status',
      schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
      status: 'updated',
      updatedFields: Object.keys(updateBusinessFields),
      projection: toBusinessRecord(updated, binding)
    };
  }

  const createFields = mapCreateFields(binding, createBusinessFields);
  assertRequiredCreateFields(binding, createBusinessFields);
  const created = await deps.bitableClient.createRecord({
    ...binding.target,
    fields: createFields
  });

  return {
    operation: 'pms_base_upsert_projection_status',
    schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
    status: 'created',
    updatedFields: Object.keys(createBusinessFields),
    projection: toBusinessRecord(created, binding)
  };
}

export async function pms_base_prune_projection_status(
  request: PmsBasePruneProjectionStatusRequest,
  deps: PmsBaseProjectionDeps
): Promise<PmsBaseUpdateProjectionResult> {
  const projectionKey = normalizeString(request.projectionKey);
  if (!projectionKey) {
    throw new PmsBaseProjectionError('invalid_payload', 'projection_key_required');
  }

  const binding = requireBinding(deps.registry, 'projectionStatus');
  const baseFields = sanitizeProjectionStatusFields(request.fields ?? {});
  const updatedAt = baseFields.updatedAt ?? deps.now?.() ?? new Date().toISOString();
  const pruneBusinessFields = {
    ...baseFields,
    status: 'pruned',
    updatedAt,
    schemaVersion: baseFields.schemaVersion ?? PMS_BASE_PROJECTION_SCHEMA_VERSION
  };
  await assertSchemaFields(deps, binding, uniqueFields(['backendId', ...Object.keys(pruneBusinessFields)]));
  const existing = await findOptionalUniqueRecordByBusinessField(deps, binding, 'backendId', projectionKey, {
    duplicateCode: 'duplicate_projection_status_key'
  });

  if (!existing) {
    return {
      operation: 'pms_base_prune_projection_status',
      schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
      status: 'pruned',
      updatedFields: [],
      projection: {
        backendId: projectionKey,
        status: 'pruned',
        updatedAt,
        schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
      }
    };
  }

  const updateFields = mapUpdateFields(binding, pruneBusinessFields);
  const recordId = requireRecordId(existing, 'projection_status_record_id_missing');
  const updated = await deps.bitableClient.updateRecord({
    ...binding.target,
    recordId,
    fields: updateFields
  });

  return {
    operation: 'pms_base_prune_projection_status',
    schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
    status: 'pruned',
    updatedFields: Object.keys(pruneBusinessFields),
    projection: toBusinessRecord(updated, binding)
  };
}

export async function pms_base_today_arrivals_projection(
  request: PmsBaseTodayReservationsProjectionRequest,
  deps: PmsBaseProjectionDeps
): Promise<PmsBaseReservationListProjectionResult> {
  return todayReservationsProjection('pms_base_today_arrivals_projection', 'arrivalDate', request, deps);
}

export async function pms_base_today_departures_projection(
  request: PmsBaseTodayReservationsProjectionRequest,
  deps: PmsBaseProjectionDeps
): Promise<PmsBaseReservationListProjectionResult> {
  return todayReservationsProjection('pms_base_today_departures_projection', 'departureDate', request, deps);
}

async function upsertProjectionByBusinessField(input: {
  deps: PmsBaseProjectionDeps;
  bindingKey: PmsBaseProjectionBindingKey;
  uniqueBusinessField: string;
  uniqueValue: string;
  fields: Record<string, unknown>;
  relationships?: RelationshipPlan[];
  duplicateCode: string;
  recordIdMissingCode: string;
  operation: PmsBaseUpdateProjectionResult['operation'];
}): Promise<PmsBaseUpdateProjectionResult> {
  const binding = requireBinding(input.deps.registry, input.bindingKey);
  const coreFields = withoutCallerSuppliedRelationshipFields(input.fields);
  const createBusinessFields = {
    ...coreFields,
    [input.uniqueBusinessField]: input.uniqueValue
  };
  await assertSchemaFields(input.deps, binding, uniqueFields([input.uniqueBusinessField, ...Object.keys(coreFields)]));
  const existing = await findOptionalUniqueRecordByBusinessField(input.deps, binding, input.uniqueBusinessField, input.uniqueValue, {
    duplicateCode: input.duplicateCode
  });

  if (existing) {
    const updateBusinessFields = pickAllowedFields(binding.updateAllowedFields, coreFields);
    const updateFields = mapUpdateFields(binding, updateBusinessFields);
    const recordId = requireRecordId(existing, input.recordIdMissingCode);
    const updated = await input.deps.bitableClient.updateRecord({
      ...binding.target,
      recordId,
      fields: updateFields
    });
    const relationResult = await writeBestEffortRelationshipFields(input.deps, binding, updated, input.relationships ?? []);

    return withRelationshipResult({
      operation: input.operation,
      schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
      status: 'updated',
      updatedFields: [...Object.keys(updateBusinessFields), ...relationResult.updatedFields],
      projection: {
        ...toBusinessRecord(updated, binding),
        ...relationResult.projection
      }
    }, relationResult);
  }

  const createFields = mapCreateFields(binding, createBusinessFields);
  assertRequiredCreateFields(binding, createBusinessFields);
  const created = await input.deps.bitableClient.createRecord({
    ...binding.target,
    fields: createFields
  });
  const relationResult = await writeBestEffortRelationshipFields(input.deps, binding, created, input.relationships ?? []);

  return withRelationshipResult({
    operation: input.operation,
    schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
    status: 'created',
    updatedFields: [...Object.keys(createBusinessFields), ...relationResult.updatedFields],
    projection: {
      ...toBusinessRecord(created, binding),
      ...relationResult.projection
    }
  }, relationResult);
}

async function todayReservationsProjection(
  operation: PmsBaseReservationListProjectionResult['operation'],
  dateBusinessField: 'arrivalDate' | 'departureDate',
  request: PmsBaseTodayReservationsProjectionRequest,
  deps: PmsBaseProjectionDeps
): Promise<PmsBaseReservationListProjectionResult> {
  const businessDate = normalizeString(request.businessDate);
  if (!businessDate) {
    throw new PmsBaseProjectionError('invalid_payload', 'business_date_required');
  }

  const binding = requireBinding(deps.registry, 'reservations');
  await assertSchemaFields(deps, binding, uniqueFields([dateBusinessField, ...binding.requiredFields]));
  const records = await listAllRecords(deps, binding.target);
  const reservations = records
    .map((record) => toBusinessRecord(record, binding))
    .filter((reservation) => sameBusinessDate(reservation[dateBusinessField], businessDate));

  return {
    operation,
    schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
    businessDate,
    reservations,
    projectionFreshness: 'Fresh'
  };
}

type RelationshipBusinessField = 'relatedRoom' | 'relatedOperationRequest';

interface RelationshipPlan {
  relationField: RelationshipBusinessField;
  targetBindingKey: PmsBaseProjectionBindingKey;
  targetBusinessField: string;
  targetBusinessValue?: string;
}

interface RelationshipWriteResult {
  attempted: boolean;
  updatedFields: string[];
  projection: Record<string, unknown>;
  warnings: PmsBaseProjectionWarning[];
}

function roomRelationshipPlans(
  fields: Record<string, unknown>,
  relationships?: Pick<PmsBaseProjectionRelationshipInputs, 'roomNumber'>
): RelationshipPlan[] {
  const roomNumber = normalizeString(relationships?.roomNumber) ?? normalizeString(fields.roomNumber);
  return roomNumber
    ? [{ relationField: 'relatedRoom', targetBindingKey: 'roomLedger', targetBusinessField: 'roomNumber', targetBusinessValue: roomNumber }]
    : [];
}

function operationLogRelationshipPlans(
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

function withoutCallerSuppliedRelationshipFields(fields: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(fields)) {
    if (RELATION_BUSINESS_FIELDS.has(field)) {
      throw new PmsBaseProjectionError('invalid_payload', `relationship_field_not_allowed:${field}`);
    }
    result[field] = value;
  }
  return result;
}

function sanitizeProjectionStatusFields(fields: Record<string, unknown>): Record<string, unknown> {
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

function looksLikeUnsafeProjectionStatusText(value: string): boolean {
  CALLBACK_URL_PATTERN.lastIndex = 0;
  SECRET_ASSIGNMENT_PATTERN.lastIndex = 0;
  return (
    BITABLE_RECORD_ID_PATTERN.test(value) ||
    TRACKED_TARGET_ID_PATTERN.test(value) ||
    CALLBACK_URL_PATTERN.test(value) ||
    SECRET_ASSIGNMENT_PATTERN.test(value)
  );
}

function redactProjectionStatusText(value: string): string {
  return value
    .replace(CALLBACK_URL_PATTERN, '[redacted-url]')
    .replace(SECRET_ASSIGNMENT_PATTERN, '[redacted-secret]')
    .replace(TRACKED_TARGET_ID_PATTERN, '[redacted-id]')
    .replace(BITABLE_RECORD_ID_PATTERN, '[redacted-record]');
}

async function writeBestEffortRelationshipFields(
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

function withRelationshipResult(
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

function requireBinding(
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

function mapUpdateFields(
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

async function assertSchemaFields(
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

async function findUniqueRecordByBusinessField(
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

async function findOptionalUniqueRecordByBusinessField(
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

async function listAllRecords(
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

async function listAllTableFields(
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

function toBusinessRecord(record: BitableRecord, binding: PmsBaseProjectionBinding): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [businessField, feishuFieldName] of Object.entries(binding.fieldMap)) {
    if (record.fields[feishuFieldName] !== undefined) {
      result[businessField] = record.fields[feishuFieldName];
    }
  }
  return result;
}

function mapCreateFields(
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

function toBitableCellValue(businessField: string, value: unknown): unknown {
  if (/(At|Date)$/.test(businessField) && typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
}

function assertRequiredCreateFields(
  binding: PmsBaseProjectionBinding,
  fields: Record<string, unknown>
): void {
  for (const businessField of binding.requiredFields) {
    if (fields[businessField] === undefined || fields[businessField] === null || fields[businessField] === '') {
      throw new PmsBaseProjectionError('invalid_payload', `required_field_missing:${businessField}`);
    }
  }
}

function pickAllowedFields(
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

function requireRecordId(record: BitableRecord, code: string): string {
  if (!record.recordId) {
    throw new PmsBaseProjectionError(code, code, 502);
  }
  return record.recordId;
}

function fieldValueMatches(value: unknown, expectedValue: string): boolean {
  if (typeof value === 'string') {
    return value.trim() === expectedValue;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value) === expectedValue;
  }
  return false;
}

function statusIn(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === 'string' && allowed.includes(value);
}

function sameBusinessDate(value: unknown, businessDate: string): boolean {
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

function uniqueFields(values: string[]): string[] {
  return [...new Set(values)];
}

function isPmsBaseProjectionBindingKey(value: string): value is PmsBaseProjectionBindingKey {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown_error';
}
