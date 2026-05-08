import type { BitableClient, BitableTableTarget } from '../../channels/feishu/bitableClient.js';

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
