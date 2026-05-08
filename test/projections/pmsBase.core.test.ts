import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  PMS_BASE_PROJECTION_SCHEMA_VERSION,
  parsePmsBaseProjectionRegistry,
  pms_base_dashboard_projection,
  pms_base_get_room_projection,
  pms_base_get_reservation_projection,
  pms_base_append_operation_log,
  pms_base_prune_inventory_calendar_projection,
  pms_base_prune_projection_status,
  pms_base_today_arrivals_projection,
  pms_base_today_departures_projection,
  pms_base_upsert_housekeeping_task_projection,
  pms_base_upsert_inventory_calendar_projection,
  pms_base_upsert_maintenance_ticket_projection,
  pms_base_upsert_operation_request,
  pms_base_upsert_projection_status,
  pms_base_upsert_reservation_projection,
  pms_base_upsert_room_projection,
  pms_base_upsert_stay_projection,
  pms_base_update_operation_result,
  pms_base_update_room_projection,
  type PmsBaseProjectionRegistry
} from '../../src/projections/pmsBase.js';
import { createRegistry, createClient, createChineseRegistry, createChineseClient, rooms, operations } from './pmsBase.helpers.js';
describe('PMS Base projection wrappers', () => {
  it('reads room and dashboard projections through controlled registry targets', async () => {
    const { registry, bitableClient } = createClient({ rooms, operations });

    const room = await pms_base_get_room_projection(
      { roomNumber: '101' },
      { registry, bitableClient, now: () => '2026-04-27T01:00:00.000Z' }
    );
    const dashboard = await pms_base_dashboard_projection(
      {},
      { registry, bitableClient, now: () => '2026-04-27T01:00:00.000Z' }
    );

    expect(room).toEqual({
      operation: 'pms_base_get_room_projection',
      schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION,
      projectionFreshness: 'Fresh',
      room: {
        roomNumber: '101',
        roomType: 'standard',
        occupancyStatus: 'Vacant',
        cleaningStatus: 'Clean',
        sellableStatus: 'Sellable',
        roomCode: 'VC',
        lastOperator: 'frontdesk-alpha',
        lastReason: 'pms read model projection',
        lastUpdatedAt: '2026-04-27T00:00:00.000Z'
      }
    });
    expect(dashboard.summary).toEqual({
      summaryStatus: 'Fresh',
      totalRooms: 3,
      vacantClean: 1,
      vacantDirty: 1,
      inHouse: 1,
      dueOut: 0,
      stopSell: 1,
      cleaningQueue: 1,
      inspectionQueue: 0,
      pendingOperationRequests: 1,
      failedOperationRequests: 1,
      projectionFreshness: 'base_projection_read'
    });
    expect(bitableClient.listRecords).toHaveBeenCalledWith({
      appToken: 'app_token_pms',
      tableId: 'room_table',
      pageSize: 500,
      pageToken: undefined
    });
  });

  it('updates room and operation projections using business keys and field allowlists', async () => {
    const updateRecord = vi.fn().mockImplementation((request) => {
      return Promise.resolve({
        recordId: request.recordId,
        fields: {
          RoomNumber: '101',
          ClientToken: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          ...request.fields
        }
      });
    });
    const { registry, bitableClient } = createClient({ rooms, operations, updateRecord });

    const roomUpdate = await pms_base_update_room_projection(
      {
        roomNumber: '101',
        fields: {
          occupancyStatus: 'InHouse',
          roomCode: 'OC',
          lastReason: 'PMS CHECK_IN confirmed'
        }
      },
      { registry, bitableClient }
    );
    const operationUpdate = await pms_base_update_operation_result(
      {
        clientToken: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        fields: {
          status: 'Done',
          resultJSON: '{"eventType":"RoomCheckedIn"}',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        }
      },
      { registry, bitableClient }
    );

    expect(roomUpdate.updatedFields).toEqual(['occupancyStatus', 'roomCode', 'lastReason']);
    expect(operationUpdate.updatedFields).toEqual(['status', 'resultJSON', 'schemaVersion']);
    expect(updateRecord).toHaveBeenNthCalledWith(1, {
      appToken: 'app_token_pms',
      tableId: 'room_table',
      recordId: 'rec_room_101',
      fields: {
        OccupancyStatus: 'InHouse',
        RoomCode: 'OC',
        LastReason: 'PMS CHECK_IN confirmed'
      }
    });
    expect(updateRecord).toHaveBeenNthCalledWith(2, {
      appToken: 'app_token_pms',
      tableId: 'operation_table',
      recordId: 'rec_operation_1',
      fields: {
        Status: 'Done',
        ResultJSON: '{"eventType":"RoomCheckedIn"}',
        SchemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
      }
    });
  });

  it('upserts OperationRequest rows with non-UUID business client tokens through the controlled wrapper', async () => {
    const createRecord = vi.fn().mockImplementation((request) => {
      return Promise.resolve({
        recordId: 'rec_operation_created',
        fields: request.fields
      });
    });
    const updateRecord = vi.fn().mockImplementation((request) => {
      return Promise.resolve({
        recordId: request.recordId,
        fields: {
          ClientToken: 'business-checkin-0308',
          ...request.fields
        }
      });
    });
    const { registry, bitableClient } = createClient({ rooms, operations: [], createRecord, updateRecord });

    const created = await pms_base_upsert_operation_request(
      {
        clientToken: 'business-checkin-0308',
        fields: {
          action: 'CHECK_IN',
          status: 'DryRunReady',
          roomNumber: '0308',
          operator: 'frontdesk-alpha',
          reason: 'guest arrival',
          requestedAt: '2026-04-28T00:00:00.000Z',
          payloadJSON: '{"source":"pms-platform"}',
          resultJSON: '{"phase":"dryRun"}',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        }
      },
      { registry, bitableClient }
    );

    expect(created).toMatchObject({
      operation: 'pms_base_upsert_operation_request',
      status: 'created',
      updatedFields: [
        'clientToken',
        'action',
        'status',
        'roomNumber',
        'operator',
        'reason',
        'requestedAt',
        'payloadJSON',
        'resultJSON',
        'schemaVersion'
      ]
    });
    expect(createRecord).toHaveBeenCalledWith({
      appToken: 'app_token_pms',
      tableId: 'operation_table',
      fields: {
        ClientToken: 'business-checkin-0308',
        Action: 'CHECK_IN',
        Status: 'DryRunReady',
        RoomNumber: '0308',
        Operator: 'frontdesk-alpha',
        Reason: 'guest arrival',
        RequestedAt: 1777334400000,
        PayloadJSON: '{"source":"pms-platform"}',
        ResultJSON: '{"phase":"dryRun"}',
        SchemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
      }
    });

    const existing = await pms_base_upsert_operation_request(
      {
        clientToken: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        fields: {
          action: 'CHECK_IN',
          status: 'Done',
          roomNumber: '101',
          operator: 'frontdesk-alpha',
          reason: 'guest arrival',
          requestedAt: '2026-04-28T00:00:00.000Z',
          payloadJSON: '{}',
          resultJSON: '{"phase":"confirm"}',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        }
      },
      { registry, bitableClient: createClient({ rooms, operations, updateRecord }).bitableClient }
    );

    expect(existing).toMatchObject({
      operation: 'pms_base_upsert_operation_request',
      status: 'updated',
      updatedFields: ['status', 'resultJSON', 'schemaVersion']
    });
    expect(updateRecord).toHaveBeenCalledWith({
      appToken: 'app_token_pms',
      tableId: 'operation_table',
      recordId: 'rec_operation_1',
      fields: {
        Status: 'Done',
        ResultJSON: '{"phase":"confirm"}',
        SchemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
      }
    });
  });

  it('upserts RoomLedger rows by room number without caller-supplied Base targets', async () => {
    const createRecord = vi.fn().mockImplementation((request) => {
      return Promise.resolve({
        recordId: 'rec_room_created',
        fields: request.fields
      });
    });
    const updateRecord = vi.fn().mockImplementation((request) => {
      return Promise.resolve({
        recordId: request.recordId,
        fields: {
          RoomNumber: '101',
          ...request.fields
        }
      });
    });
    const { registry, bitableClient } = createClient({ rooms: [], operations, createRecord, updateRecord });

    const created = await pms_base_upsert_room_projection(
      {
        roomNumber: '1001',
        fields: {
          roomType: 'standard',
          occupancyStatus: 'Vacant',
          cleaningStatus: 'Dirty',
          sellableStatus: 'Sellable',
          roomCode: 'VD',
          lastOperator: 'Sandbox Operator',
          lastReason: 'PMS CHECK_OUT confirmed',
          lastUpdatedAt: '2026-04-28T00:00:00.000Z'
        }
      },
      { registry, bitableClient }
    );

    expect(created).toMatchObject({
      operation: 'pms_base_upsert_room_projection',
      status: 'created',
      updatedFields: [
        'roomNumber',
        'roomType',
        'occupancyStatus',
        'cleaningStatus',
        'sellableStatus',
        'roomCode',
        'lastOperator',
        'lastReason',
        'lastUpdatedAt'
      ]
    });
    expect(createRecord).toHaveBeenCalledWith({
      appToken: 'app_token_pms',
      tableId: 'room_table',
      fields: {
        RoomNumber: '1001',
        RoomType: 'standard',
        OccupancyStatus: 'Vacant',
        CleaningStatus: 'Dirty',
        SellableStatus: 'Sellable',
        RoomCode: 'VD',
        LastOperator: 'Sandbox Operator',
        LastReason: 'PMS CHECK_OUT confirmed',
        LastUpdatedAt: 1777334400000
      }
    });

    const existing = await pms_base_upsert_room_projection(
      {
        roomNumber: '101',
        fields: {
          roomType: 'standard',
          occupancyStatus: 'InHouse',
          cleaningStatus: 'Clean',
          sellableStatus: 'Sellable',
          roomCode: 'OC',
          lastOperator: 'Sandbox Operator',
          lastReason: 'PMS CHECK_IN confirmed',
          lastUpdatedAt: '2026-04-28T00:01:00.000Z'
        }
      },
      { registry, bitableClient: createClient({ rooms, operations, updateRecord }).bitableClient }
    );

    expect(existing).toMatchObject({
      operation: 'pms_base_upsert_room_projection',
      status: 'updated',
      updatedFields: [
        'occupancyStatus',
        'cleaningStatus',
        'sellableStatus',
        'roomCode',
        'lastOperator',
        'lastReason',
        'lastUpdatedAt'
      ]
    });
  });

  it('appends OperationLog rows through an audit-id idempotency key', async () => {
    const createRecord = vi.fn().mockImplementation((request) => {
      return Promise.resolve({
        recordId: 'rec_log_created',
        fields: request.fields
      });
    });
    const { registry, bitableClient } = createClient({ rooms, operations, operationLogs: [], createRecord });

    const created = await pms_base_append_operation_log(
      {
        auditId: 'audit-checkin-0308',
        fields: {
          commandType: 'CHECK_IN',
          roomNumber: '0308',
          actor: 'Sandbox Operator',
          source: 'pms-platform',
          reason: 'guest arrival',
          idempotencyKey: 'idem-checkin-0308-confirm',
          correlationId: 'corr-checkin-0308',
          occurredAt: '2026-04-28T00:00:00.000Z',
          domainEventTypes: 'RoomCheckedIn',
          payloadJSON: '{"ok":true}',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        }
      },
      { registry, bitableClient }
    );

    expect(created).toMatchObject({
      operation: 'pms_base_append_operation_log',
      status: 'created',
      updatedFields: [
        'auditId',
        'commandType',
        'roomNumber',
        'actor',
        'source',
        'reason',
        'idempotencyKey',
        'correlationId',
        'occurredAt',
        'domainEventTypes',
        'payloadJSON',
        'schemaVersion'
      ]
    });
    expect(createRecord).toHaveBeenCalledWith({
      appToken: 'app_token_pms',
      tableId: 'operation_log_table',
      fields: {
        AuditId: 'audit-checkin-0308',
        CommandType: 'CHECK_IN',
        RoomNumber: '0308',
        Actor: 'Sandbox Operator',
        Source: 'pms-platform',
        Reason: 'guest arrival',
        IdempotencyKey: 'idem-checkin-0308-confirm',
        CorrelationId: 'corr-checkin-0308',
        OccurredAt: 1777334400000,
        DomainEventTypes: 'RoomCheckedIn',
        PayloadJSON: '{"ok":true}',
        SchemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
      }
    });
  });

  it('upserts Chinese housekeeping task and maintenance ticket projections through controlled wrappers', async () => {
    const createRecord = vi.fn().mockImplementation((request) => Promise.resolve({
      recordId: 'rec_created',
      fields: request.fields
    }));
    const { registry, bitableClient } = createChineseClient({ createRecord });

    const task = await pms_base_upsert_housekeeping_task_projection(
      {
        taskId: 'task-A1',
        fields: {
          roomNumber: 'A1',
          kind: 'room-cleaning',
          status: '待查',
          reason: 'A1 已打扫完成，需要验房',
          correlationId: 'corr-housekeeping-A1',
          createdAt: '2026-04-28T00:00:00.000Z',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        }
      },
      { registry, bitableClient }
    );
    const ticket = await pms_base_upsert_maintenance_ticket_projection(
      {
        ticketId: 'ticket-A2',
        fields: {
          roomNumber: 'A2',
          status: '待处理',
          severity: 'StopSell',
          stopSellRequested: '是',
          reason: '空调故障，需要停售',
          correlationId: 'corr-maintenance-A2',
          createdAt: '2026-04-28T00:00:00.000Z',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        }
      },
      { registry, bitableClient }
    );

    expect(task).toMatchObject({
      operation: 'pms_base_upsert_housekeeping_task_projection',
      status: 'created',
      projection: {
        taskId: 'task-A1',
        roomNumber: 'A1',
        status: '待查'
      }
    });
    expect(ticket).toMatchObject({
      operation: 'pms_base_upsert_maintenance_ticket_projection',
      status: 'created',
      projection: {
        ticketId: 'ticket-A2',
        roomNumber: 'A2',
        stopSellRequested: '是'
      }
    });
    expect(createRecord).toHaveBeenNthCalledWith(1, {
      appToken: 'app_token_pms',
      tableId: 'housekeeping_table',
      fields: {
        任务ID: 'task-A1',
        房号: 'A1',
        任务类型: 'room-cleaning',
        任务状态: '待查',
        原因: 'A1 已打扫完成，需要验房',
        关联ID: 'corr-housekeeping-A1',
        创建时间: 1777334400000,
        版本: PMS_BASE_PROJECTION_SCHEMA_VERSION
      }
    });
    expect(createRecord).toHaveBeenNthCalledWith(2, {
      appToken: 'app_token_pms',
      tableId: 'maintenance_table',
      fields: {
        工单ID: 'ticket-A2',
        房号: 'A2',
        工单状态: '待处理',
        严重级别: 'StopSell',
        是否停售: '是',
        维修备注: '空调故障，需要停售',
        关联ID: 'corr-maintenance-A2',
        创建时间: 1777334400000,
        版本: PMS_BASE_PROJECTION_SCHEMA_VERSION
      }
    });
  });


});
