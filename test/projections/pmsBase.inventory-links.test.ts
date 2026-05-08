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
  it('upserts and prunes inventory calendar projections by backend interval key', async () => {
    const registry = createChineseRegistry();
    const createRecord = vi.fn().mockImplementation((request) => Promise.resolve({
      recordId: 'rec_inventory_created',
      fields: request.fields
    }));
    const updateRecord = vi.fn().mockImplementation((request) => Promise.resolve({
      recordId: request.recordId,
      fields: {
        库存区间键: 'inventory-room-A2-2026-04-28-blocked',
        ...request.fields
      }
    }));

    const createdClient = createChineseClient({ createRecord });
    const created = await pms_base_upsert_inventory_calendar_projection(
      {
        intervalKey: 'inventory-room-A2-2026-04-28-blocked',
        fields: {
          propertyId: 'property-small-hotel',
          roomId: 'room-A2',
          roomNumber: 'A2',
          roomTypeId: 'room-type-garden-villa',
          roomType: '花园别墅',
          startDate: '2026-04-28',
          endDate: '2026-04-29',
          calendarKind: 'blocked',
          sellableStatus: 'outOfOrder',
          title: 'A2 blocked',
          sourceRefsJSON: '[{"sourceType":"inventory_block","sourceId":"block-ticket-A2"}]',
          projectionStatus: 'Active',
          updatedAt: '2026-04-28T00:00:00.000Z',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        }
      },
      { registry, bitableClient: createdClient.bitableClient }
    );

    expect(created).toMatchObject({
      operation: 'pms_base_upsert_inventory_calendar_projection',
      status: 'created',
      projection: {
        intervalKey: 'inventory-room-A2-2026-04-28-blocked',
        roomId: 'room-A2',
        calendarKind: 'blocked'
      }
    });
    expect(createRecord).toHaveBeenCalledWith({
      appToken: 'app_token_pms',
      tableId: 'inventory_table',
      fields: {
        库存区间键: 'inventory-room-A2-2026-04-28-blocked',
        门店ID: 'property-small-hotel',
        房间ID: 'room-A2',
        房号: 'A2',
        房型ID: 'room-type-garden-villa',
        房型: '花园别墅',
        开始日期: 1777334400000,
        结束日期: 1777420800000,
        日历状态: 'blocked',
        可售状态: 'outOfOrder',
        标题: 'A2 blocked',
        来源JSON: '[{"sourceType":"inventory_block","sourceId":"block-ticket-A2"}]',
        投影状态: 'Active',
        更新时间: 1777334400000,
        版本: PMS_BASE_PROJECTION_SCHEMA_VERSION
      }
    });

    const existingClient = createChineseClient({
      inventoryCalendar: [
        {
          recordId: 'rec_inventory_existing',
          fields: {
            库存区间键: 'inventory-room-A2-2026-04-28-blocked',
            房号: 'A2',
            日历状态: 'blocked',
            投影状态: 'Active',
            版本: PMS_BASE_PROJECTION_SCHEMA_VERSION
          }
        }
      ],
      updateRecord
    });
    const updated = await pms_base_upsert_inventory_calendar_projection(
      {
        intervalKey: 'inventory-room-A2-2026-04-28-blocked',
        fields: {
          calendarKind: 'available',
          projectionStatus: 'Active',
          updatedAt: '2026-04-28T00:01:00.000Z',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        }
      },
      { registry, bitableClient: existingClient.bitableClient }
    );
    const pruned = await pms_base_prune_inventory_calendar_projection(
      {
        intervalKey: 'inventory-room-A2-2026-04-28-blocked',
        fields: { updatedAt: '2026-04-28T00:02:00.000Z' }
      },
      {
        registry,
        bitableClient: existingClient.bitableClient,
        now: () => '2026-04-28T00:03:00.000Z'
      }
    );

    expect(updated).toMatchObject({ operation: 'pms_base_upsert_inventory_calendar_projection', status: 'updated' });
    expect(pruned).toMatchObject({ operation: 'pms_base_prune_inventory_calendar_projection', status: 'pruned' });
    expect(updateRecord).toHaveBeenNthCalledWith(1, {
      appToken: 'app_token_pms',
      tableId: 'inventory_table',
      recordId: 'rec_inventory_existing',
      fields: {
        日历状态: 'available',
        投影状态: 'Active',
        更新时间: 1777334460000,
        版本: PMS_BASE_PROJECTION_SCHEMA_VERSION
      }
    });
    expect(updateRecord).toHaveBeenNthCalledWith(2, {
      appToken: 'app_token_pms',
      tableId: 'inventory_table',
      recordId: 'rec_inventory_existing',
      fields: {
        更新时间: 1777334520000,
        投影状态: 'Pruned',
        剪枝时间: 1777334580000,
        版本: PMS_BASE_PROJECTION_SCHEMA_VERSION
      }
    });
  });

  it('resolves linked-record fields from business keys after core projection writes', async () => {
    const createRecord = vi.fn().mockImplementation((request) => Promise.resolve({
      recordId: request.tableId === 'operation_log_table' ? 'rec_log_A1' : 'rec_task_A1',
      fields: request.fields
    }));
    const updateRecord = vi.fn().mockImplementation((request) => Promise.resolve({
      recordId: request.recordId,
      fields: request.fields
    }));
    const { registry, bitableClient } = createChineseClient({
      rooms: [{ recordId: 'rec_room_A1', fields: { 房号: 'A1' } }],
      operationRequests: [{ recordId: 'rec_operation_request_A1', fields: { 请求令牌: 'client-A1' } }],
      createRecord,
      updateRecord
    });

    const task = await pms_base_upsert_housekeeping_task_projection(
      {
        taskId: 'task-A1-linked',
        fields: {
          roomNumber: 'A1',
          kind: 'room-cleaning',
          status: '待查',
          reason: 'A1 已打扫完成，需要验房',
          correlationId: 'corr-housekeeping-A1-linked',
          createdAt: '2026-04-28T00:00:00.000Z',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        }
      },
      { registry, bitableClient }
    );
    const log = await pms_base_append_operation_log(
      {
        auditId: 'audit-A1-linked',
        fields: {
          commandType: 'CHECK_IN',
          roomNumber: 'A1',
          actor: 'frontdesk-alpha',
          source: 'pms-platform',
          reason: 'guest arrival',
          idempotencyKey: 'idem-A1-linked',
          correlationId: 'corr-A1-linked',
          occurredAt: '2026-04-28T00:01:00.000Z',
          domainEventTypes: 'RoomCheckedIn',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        },
        relationships: { operationClientToken: 'client-A1' }
      },
      { registry, bitableClient }
    );

    expect(task).toMatchObject({
      operation: 'pms_base_upsert_housekeeping_task_projection',
      status: 'created',
      relationStatus: 'fresh',
      warnings: [],
      projection: {
        taskId: 'task-A1-linked',
        roomNumber: 'A1',
        relatedRoom: ['rec_room_A1']
      }
    });
    expect(log).toMatchObject({
      operation: 'pms_base_append_operation_log',
      status: 'created',
      relationStatus: 'fresh',
      warnings: [],
      projection: {
        auditId: 'audit-A1-linked',
        roomNumber: 'A1',
        relatedRoom: ['rec_room_A1'],
        relatedOperationRequest: ['rec_operation_request_A1']
      }
    });
    expect(createRecord).toHaveBeenNthCalledWith(1, {
      appToken: 'app_token_pms',
      tableId: 'housekeeping_table',
      fields: {
        任务ID: 'task-A1-linked',
        房号: 'A1',
        任务类型: 'room-cleaning',
        任务状态: '待查',
        原因: 'A1 已打扫完成，需要验房',
        关联ID: 'corr-housekeeping-A1-linked',
        创建时间: 1777334400000,
        版本: PMS_BASE_PROJECTION_SCHEMA_VERSION
      }
    });
    expect(updateRecord).toHaveBeenNthCalledWith(1, {
      appToken: 'app_token_pms',
      tableId: 'housekeeping_table',
      recordId: 'rec_task_A1',
      fields: { 关联房间: ['rec_room_A1'] }
    });
    expect(updateRecord).toHaveBeenNthCalledWith(2, {
      appToken: 'app_token_pms',
      tableId: 'operation_log_table',
      recordId: 'rec_log_A1',
      fields: {
        关联房间: ['rec_room_A1'],
        关联操作请求: ['rec_operation_request_A1']
      }
    });
  });

  it('keeps core projection writes when linked fields or related records are unavailable', async () => {
    const missingLinkedField = await pms_base_upsert_housekeeping_task_projection(
      {
        taskId: 'task-missing-linked-field',
        fields: {
          roomNumber: 'A1',
          kind: 'room-cleaning',
          status: '待查',
          reason: 'A1 已打扫完成，需要验房',
          correlationId: 'corr-missing-linked-field',
          createdAt: '2026-04-28T00:00:00.000Z',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        }
      },
      {
        registry: createChineseRegistry(),
        bitableClient: createChineseClient({
          rooms: [{ recordId: 'rec_room_A1', fields: { 房号: 'A1' } }],
          missingFieldName: '关联房间'
        }).bitableClient
      }
    );
    const missingRelatedRecord = await pms_base_upsert_maintenance_ticket_projection(
      {
        ticketId: 'ticket-missing-room',
        fields: {
          roomNumber: 'A-missing',
          status: '待处理',
          severity: 'StopSell',
          stopSellRequested: '是',
          reason: '房间不存在时仍写核心工单投影',
          correlationId: 'corr-missing-room',
          createdAt: '2026-04-28T00:00:00.000Z',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        }
      },
      { registry: createChineseRegistry(), bitableClient: createChineseClient().bitableClient }
    );
    const duplicateRelatedRecord = await pms_base_upsert_reservation_projection(
      {
        reservationCode: 'R-duplicate-room',
        fields: {
          roomNumber: 'A-dupe',
          guestLabel: 'Guest A',
          arrivalDate: '2026-04-28T00:00:00.000Z',
          departureDate: '2026-04-29T00:00:00.000Z',
          status: '已预订',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        }
      },
      {
        registry: createChineseRegistry(),
        bitableClient: createChineseClient({
          rooms: [
            { recordId: 'rec_room_dupe_1', fields: { 房号: 'A-dupe' } },
            { recordId: 'rec_room_dupe_2', fields: { 房号: 'A-dupe' } }
          ]
        }).bitableClient
      }
    );

    expect(missingLinkedField).toMatchObject({
      status: 'created',
      relationStatus: 'stale',
      warnings: [{ code: 'linked_record_field_missing', relationField: 'relatedRoom' }],
      projection: { taskId: 'task-missing-linked-field', roomNumber: 'A1' }
    });
    expect(missingRelatedRecord).toMatchObject({
      status: 'created',
      relationStatus: 'stale',
      warnings: [{ code: 'linked_record_related_record_missing', businessValue: 'A-missing' }],
      projection: { ticketId: 'ticket-missing-room', roomNumber: 'A-missing' }
    });
    expect(duplicateRelatedRecord).toMatchObject({
      status: 'created',
      relationStatus: 'stale',
      warnings: [{ code: 'linked_record_related_record_duplicate', businessValue: 'A-dupe' }],
      projection: { reservationCode: 'R-duplicate-room', roomNumber: 'A-dupe' }
    });
  });

  it('degrades linked-record update failures to stale warnings after core projection writes', async () => {
    const createRecord = vi.fn().mockImplementation((request) => Promise.resolve({
      recordId: 'rec_inventory_link_failure',
      fields: request.fields
    }));
    const updateRecord = vi.fn().mockRejectedValue(new Error('link field rejected'));
    const { registry, bitableClient } = createChineseClient({
      rooms: [{ recordId: 'rec_room_A2', fields: { 房号: 'A2' } }],
      createRecord,
      updateRecord
    });

    const result = await pms_base_upsert_inventory_calendar_projection(
      {
        intervalKey: 'inventory-room-A2-2026-04-28-blocked-link-failure',
        fields: {
          propertyId: 'property-small-hotel',
          roomId: 'room-A2',
          roomNumber: 'A2',
          startDate: '2026-04-28',
          endDate: '2026-04-29',
          calendarKind: 'blocked',
          sellableStatus: 'outOfOrder',
          title: 'A2 blocked',
          sourceRefsJSON: '[]',
          projectionStatus: 'Active',
          updatedAt: '2026-04-28T00:00:00.000Z',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        }
      },
      { registry, bitableClient }
    );

    expect(result).toMatchObject({
      status: 'created',
      relationStatus: 'stale',
      warnings: [{ code: 'linked_record_update_failed' }],
      projection: {
        intervalKey: 'inventory-room-A2-2026-04-28-blocked-link-failure',
        roomNumber: 'A2',
        projectionStatus: 'Active'
      }
    });
    expect(createRecord).toHaveBeenCalledWith({
      appToken: 'app_token_pms',
      tableId: 'inventory_table',
      fields: expect.objectContaining({
        库存区间键: 'inventory-room-A2-2026-04-28-blocked-link-failure',
        房号: 'A2',
        投影状态: 'Active'
      })
    });
    expect(updateRecord).toHaveBeenCalledWith({
      appToken: 'app_token_pms',
      tableId: 'inventory_table',
      recordId: 'rec_inventory_link_failure',
      fields: { 关联房间: ['rec_room_A2'] }
    });
  });

  it('rejects caller-supplied linked-record fields instead of treating raw record IDs as relationship truth', async () => {
    const client = createChineseClient({ rooms: [{ recordId: 'rec_room_A1', fields: { 房号: 'A1' } }] });

    await expect(
      pms_base_upsert_housekeeping_task_projection(
        {
          taskId: 'task-raw-link-field',
          fields: {
            roomNumber: 'A1',
            relatedRoom: ['rec_room_A1'],
            kind: 'room-cleaning',
            status: '待查',
            reason: 'raw linked field should not be accepted',
            correlationId: 'corr-raw-link-field',
            createdAt: '2026-04-28T00:00:00.000Z',
            schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
          }
        },
        { registry: createChineseRegistry(), bitableClient: client.bitableClient }
      )
    ).rejects.toThrow(/relationship_field_not_allowed:relatedRoom/);
    expect(client.bitableClient.createRecord).not.toHaveBeenCalled();
    expect(client.bitableClient.updateRecord).not.toHaveBeenCalled();
  });

  it('keeps raw record-id-shaped relationship inputs stale instead of using them as relationship truth', async () => {
    const client = createChineseClient({ rooms: [{ recordId: 'rec_room_A1', fields: { 房号: 'A1' } }] });

    const result = await pms_base_upsert_housekeeping_task_projection(
      {
        taskId: 'task-raw-relationship-input',
        fields: {
          roomNumber: 'A1',
          kind: 'room-cleaning',
          status: '待查',
          reason: 'raw relationship business key should not be accepted',
          correlationId: 'corr-raw-relationship-input',
          createdAt: '2026-04-28T00:00:00.000Z',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        },
        relationships: { roomNumber: 'rec_room_A1' }
      },
      { registry: createChineseRegistry(), bitableClient: client.bitableClient }
    );

    expect(result).toMatchObject({
      status: 'created',
      relationStatus: 'stale',
      warnings: [{ code: 'relationship_business_key_rejected_record_id_shape', relationField: 'relatedRoom' }],
      projection: { taskId: 'task-raw-relationship-input', roomNumber: 'A1' }
    });
    expect(client.bitableClient.updateRecord).not.toHaveBeenCalled();
  });

  it('upserts and prunes projection status rows through the controlled status wrapper', async () => {
    const registry = createChineseRegistry();
    const createRecord = vi.fn().mockImplementation((request) => Promise.resolve({
      recordId: 'rec_projection_status_created',
      fields: request.fields
    }));
    const createdClient = createChineseClient({ createRecord });

    const created = await pms_base_upsert_projection_status(
      {
        projectionKey: 'projection-status:inventoryCalendar:inventory-room-A2-2026-04-28-blocked',
        fields: {
          projectionName: '库存日历',
          aggregateKey: 'inventory-room-A2-2026-04-28-blocked',
          status: 'failed',
          attemptCount: 3,
          lastProjectedAt: '2026-04-28T00:00:00.000Z',
          lastErrorSummary: 'adapter failed appToken=app_token_pms tableId=tbl1234567890AB callback=https://feishu.example/webhook/callback?token=secret-token',
          updatedAt: '2026-04-28T00:01:00.000Z',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        }
      },
      { registry, bitableClient: createdClient.bitableClient }
    );

    expect(created).toMatchObject({
      operation: 'pms_base_upsert_projection_status',
      status: 'created',
      projection: {
        backendId: 'projection-status:inventoryCalendar:inventory-room-A2-2026-04-28-blocked',
        projectionName: '库存日历',
        aggregateKey: 'inventory-room-A2-2026-04-28-blocked',
        status: 'failed',
        attemptCount: 3,
        schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
      }
    });
    expect(String(created.projection.lastErrorSummary)).toContain('[redacted-secret]');
    expect(String(created.projection.lastErrorSummary)).not.toMatch(/appToken|app_token|tableId|tbl1234567890AB|callback|secret-token/);
    expect(createRecord).toHaveBeenCalledWith({
      appToken: 'app_token_pms',
      tableId: 'projection_status_table',
      fields: {
        后端ID: 'projection-status:inventoryCalendar:inventory-room-A2-2026-04-28-blocked',
        投影名称: '库存日历',
        聚合键: 'inventory-room-A2-2026-04-28-blocked',
        状态: 'failed',
        尝试次数: 3,
        最近投影时间: 1777334400000,
        错误摘要: 'adapter failed [redacted-secret] [redacted-secret] [redacted-secret]',
        更新时间: 1777334460000,
        版本: PMS_BASE_PROJECTION_SCHEMA_VERSION
      }
    });

    const updateRecord = vi.fn().mockImplementation((request) => Promise.resolve({ recordId: request.recordId, fields: request.fields }));
    const pruned = await pms_base_prune_projection_status(
      { projectionKey: 'projection-status:inventoryCalendar:inventory-room-A2-2026-04-28-blocked' },
      {
        registry,
        bitableClient: createChineseClient({
          projectionStatus: [{ recordId: 'rec_projection_status_existing', fields: { 后端ID: 'projection-status:inventoryCalendar:inventory-room-A2-2026-04-28-blocked' } }],
          updateRecord
        }).bitableClient,
        now: () => '2026-04-28T00:02:00.000Z'
      }
    );

    expect(pruned).toMatchObject({ operation: 'pms_base_prune_projection_status', status: 'pruned' });
    expect(updateRecord).toHaveBeenCalledWith({
      appToken: 'app_token_pms',
      tableId: 'projection_status_table',
      recordId: 'rec_projection_status_existing',
      fields: {
        状态: 'pruned',
        更新时间: 1777334520000,
        版本: PMS_BASE_PROJECTION_SCHEMA_VERSION
      }
    });
  });


});
