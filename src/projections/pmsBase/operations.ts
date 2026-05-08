import { PmsBaseProjectionError } from './errors.js';
import {
  operationLogRelationshipPlans,
  roomRelationshipPlans,
  type RelationshipPlan,
  withoutCallerSuppliedRelationshipFields,
  withRelationshipResult,
  writeBestEffortRelationshipFields
} from './relationships.js';
import { sanitizeProjectionStatusFields } from './redaction.js';
import {
  assertRequiredCreateFields,
  assertSchemaFields,
  findOptionalUniqueRecordByBusinessField,
  findUniqueRecordByBusinessField,
  listAllRecords,
  mapCreateFields,
  mapUpdateFields,
  normalizeString,
  pickAllowedFields,
  requireBinding,
  requireRecordId,
  sameBusinessDate,
  statusIn,
  toBusinessRecord,
  uniqueFields,
  UUID_V4_PATTERN
} from './shared.js';
import {
  PMS_BASE_PROJECTION_SCHEMA_VERSION,
  type PmsBaseAppendOperationLogRequest,
  type PmsBaseDashboardProjectionRequest,
  type PmsBaseDashboardProjectionResult,
  type PmsBaseGetReservationProjectionRequest,
  type PmsBaseGetRoomProjectionRequest,
  type PmsBasePruneInventoryCalendarProjectionRequest,
  type PmsBasePruneProjectionStatusRequest,
  type PmsBaseProjectionBindingKey,
  type PmsBaseProjectionDeps,
  type PmsBaseReservationListProjectionResult,
  type PmsBaseReservationProjectionResult,
  type PmsBaseRoomProjectionResult,
  type PmsBaseTodayReservationsProjectionRequest,
  type PmsBaseUpdateOperationResultRequest,
  type PmsBaseUpdateProjectionResult,
  type PmsBaseUpdateRoomProjectionRequest,
  type PmsBaseUpsertHousekeepingTaskProjectionRequest,
  type PmsBaseUpsertInventoryCalendarProjectionRequest,
  type PmsBaseUpsertMaintenanceTicketProjectionRequest,
  type PmsBaseUpsertOperationRequestRequest,
  type PmsBaseUpsertProjectionStatusRequest,
  type PmsBaseUpsertReservationProjectionRequest,
  type PmsBaseUpsertRoomProjectionRequest,
  type PmsBaseUpsertStayProjectionRequest
} from './types.js';

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
