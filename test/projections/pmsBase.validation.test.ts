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
  it('rejects projection status raw targets, unsafe identifiers, schema drift, and duplicates', async () => {
    const registry = createChineseRegistry();
    const validFields = {
      projectionName: '库存日历',
      aggregateKey: 'inventory-room-A2-2026-04-28-blocked',
      status: 'retry_pending',
      attemptCount: 1,
      updatedAt: '2026-04-28T00:01:00.000Z',
      schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
    };

    await expect(
      pms_base_upsert_projection_status(
        { projectionKey: 'projection-status:inventoryCalendar:A2', fields: { ...validFields, appToken: 'not allowed' } },
        { registry, bitableClient: createChineseClient().bitableClient }
      )
    ).rejects.toThrow(/projection_status_field_not_allowed:appToken/);

    await expect(
      pms_base_upsert_projection_status(
        { projectionKey: 'projection-status:inventoryCalendar:A2', fields: { ...validFields, aggregateKey: 'rec1234567890AB' } },
        { registry, bitableClient: createChineseClient().bitableClient }
      )
    ).rejects.toThrow(/unsafe_projection_status_value:aggregateKey/);

    await expect(
      pms_base_upsert_projection_status(
        { projectionKey: 'projection-status:inventoryCalendar:A2', fields: validFields },
        { registry, bitableClient: createChineseClient({ missingFieldName: '状态' }).bitableClient }
      )
    ).rejects.toThrow(/schema_field_missing:projectionStatus:status/);

    await expect(
      pms_base_prune_projection_status(
        { projectionKey: 'projection-status:inventoryCalendar:A2' },
        {
          registry,
          bitableClient: createChineseClient({
            projectionStatus: [
              { recordId: 'rec_projection_status_1', fields: { 后端ID: 'projection-status:inventoryCalendar:A2' } },
              { recordId: 'rec_projection_status_2', fields: { 后端ID: 'projection-status:inventoryCalendar:A2' } }
            ]
          }).bitableClient
        }
      )
    ).rejects.toThrow(/duplicate_projection_status_key/);
  });

  it('rejects inventory calendar schema drift, unmapped fields, and duplicate interval keys', async () => {
    const registry = createChineseRegistry();
    const validFields = {
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
    };

    await expect(
      pms_base_upsert_inventory_calendar_projection(
        { intervalKey: 'inventory-A2', fields: { ...validFields, appToken: 'not allowed' } },
        { registry, bitableClient: createChineseClient().bitableClient }
      )
    ).rejects.toThrow(/schema_mapping_missing:inventoryCalendar:appToken/);

    await expect(
      pms_base_upsert_inventory_calendar_projection(
        { intervalKey: 'inventory-A2', fields: validFields },
        { registry, bitableClient: createChineseClient({ missingFieldName: '日历状态' }).bitableClient }
      )
    ).rejects.toThrow(/schema_field_missing:inventoryCalendar:calendarKind/);

    await expect(
      pms_base_prune_inventory_calendar_projection(
        { intervalKey: 'inventory-A2' },
        {
          registry,
          bitableClient: createChineseClient({
            inventoryCalendar: [
              { recordId: 'rec_inventory_1', fields: { 库存区间键: 'inventory-A2' } },
              { recordId: 'rec_inventory_2', fields: { 库存区间键: 'inventory-A2' } }
            ]
          }).bitableClient
        }
      )
    ).rejects.toThrow(/duplicate_inventory_interval_key/);
  });

  it('rejects schema drift instead of silently coercing missing fields', async () => {
    const { registry, bitableClient } = createClient({
      rooms,
      operations,
      missingFieldName: 'OccupancyStatus'
    });

    await expect(
      pms_base_get_room_projection({ roomNumber: '101' }, { registry, bitableClient })
    ).rejects.toThrow(/schema_field_missing:roomLedger:occupancyStatus/);
  });

  it('rejects disallowed update fields and duplicate client tokens', async () => {
    const { registry, bitableClient } = createClient({
      rooms,
      operations: [operations[0], { ...operations[0], recordId: 'rec_operation_duplicate' }]
    });

    await expect(
      pms_base_update_room_projection(
        {
          roomNumber: '101',
          fields: {
            appToken: 'not allowed'
          }
        },
        { registry, bitableClient }
      )
    ).rejects.toThrow(/field_not_allowed:appToken/);

    await expect(
      pms_base_update_operation_result(
        {
          clientToken: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          fields: {
            status: 'Done'
          }
        },
        { registry, bitableClient }
      )
    ).rejects.toThrow(/duplicate_client_token/);
    expect(bitableClient.updateRecord).not.toHaveBeenCalled();
  });

  it('keeps tracked PMS Base registry example placeholder-only with projectionStatus binding', () => {
    const raw = readFileSync(new URL('../../config/pms-base-projections.example.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(raw) as { bindings?: Record<string, unknown> };
    const registry = parsePmsBaseProjectionRegistry(parsed, 'pms-base-projections.example.json');

    expect(registry.bindings.stays).toMatchObject({
      enabled: true,
      target: { appToken: 'example_pms_base_app_token', tableId: 'example_stays_table' },
      fieldMap: {
        backendId: '后端ID',
        reservationCode: '预订号',
        roomNumber: '房号',
        relatedRoom: '关联房间',
        status: '入住状态',
        checkedInAt: '入住时间',
        checkedOutAt: '离店时间',
        schemaVersion: '版本'
      }
    });
    expect(registry.bindings.projectionStatus).toMatchObject({
      enabled: true,
      target: { appToken: 'example_pms_base_app_token', tableId: 'example_projection_status_table' },
      fieldMap: {
        backendId: '后端ID',
        projectionName: '投影名称',
        aggregateKey: '聚合键',
        status: '状态',
        attemptCount: '尝试次数',
        lastProjectedAt: '最近投影时间',
        lastErrorSummary: '错误摘要',
        updatedAt: '更新时间',
        schemaVersion: '版本'
      }
    });
    expect(raw).not.toMatch(/bascn|tbl[a-zA-Z0-9]{12,}|fld[a-zA-Z0-9]{12,}|rec[a-zA-Z0-9]{12,}|app_secret|record_id|form_id/);
  });

  it('rejects registry bindings that would broaden the controlled contract', () => {
    expect(() =>
      parsePmsBaseProjectionRegistry({
        version: 1,
        bindings: {
          arbitraryTable: {
            enabled: true
          },
          roomLedger: {
            enabled: true,
            target: { appToken: 'app_token_pms', tableId: 'room_table' },
            fieldMap: { roomNumber: 'RoomNumber' },
            requiredFields: ['roomNumber'],
            updateAllowedFields: ['occupancyStatus']
          },
          operationRequests: {
            enabled: true,
            target: { appToken: 'app_token_pms', tableId: 'operation_table' },
            fieldMap: { clientToken: 'ClientToken' },
            requiredFields: ['clientToken'],
            updateAllowedFields: ['status']
          }
        }
      })
    ).toThrow(/arbitraryTable/);
  });
});
