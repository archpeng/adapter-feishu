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
  it('reads reservations from Chinese Base projections without write calls', async () => {
    const { registry, bitableClient } = createChineseClient({
      reservations: [
        {
          recordId: 'rec_reservation_1',
          fields: {
            预订号: 'R-A1',
            房号: 'A1',
            客人: 'Guest A',
            到店日期: '2026-04-28T08:00:00.000Z',
            离店日期: '2026-04-30T04:00:00.000Z',
            预订状态: '已预订',
            版本: PMS_BASE_PROJECTION_SCHEMA_VERSION
          }
        },
        {
          recordId: 'rec_reservation_2',
          fields: {
            预订号: 'R-A2',
            房号: 'A2',
            客人: 'Guest B',
            到店日期: '2026-04-29T08:00:00.000Z',
            离店日期: '2026-04-28T04:00:00.000Z',
            预订状态: '已预订',
            版本: PMS_BASE_PROJECTION_SCHEMA_VERSION
          }
        }
      ]
    });

    const reservation = await pms_base_get_reservation_projection(
      { reservationCode: 'R-A1' },
      { registry, bitableClient }
    );
    const arrivals = await pms_base_today_arrivals_projection(
      { businessDate: '2026-04-28' },
      { registry, bitableClient }
    );
    const departures = await pms_base_today_departures_projection(
      { businessDate: '2026-04-28' },
      { registry, bitableClient }
    );

    expect(reservation.reservation).toMatchObject({
      reservationCode: 'R-A1',
      roomNumber: 'A1',
      guestLabel: 'Guest A'
    });
    expect(arrivals.reservations.map((item) => item.reservationCode)).toEqual(['R-A1']);
    expect(departures.reservations.map((item) => item.reservationCode)).toEqual(['R-A2']);
    expect(bitableClient.createRecord).not.toHaveBeenCalled();
    expect(bitableClient.updateRecord).not.toHaveBeenCalled();
  });

  it('upserts reservation projections by reservationCode', async () => {
    const existingClient = createChineseClient({
      reservations: [
        {
          recordId: 'rec_reservation_existing',
          fields: {
            预订号: 'R-200',
            房号: 'A1',
            客人: 'Guest A',
            到店日期: Date.parse('2026-04-28T00:00:00.000Z'),
            离店日期: Date.parse('2026-04-29T00:00:00.000Z'),
            预订状态: '已预订',
            版本: PMS_BASE_PROJECTION_SCHEMA_VERSION
          }
        }
      ]
    });
    const registry = createChineseRegistry();

    const updated = await pms_base_upsert_reservation_projection(
      {
        reservationCode: 'R-200',
        fields: {
          roomNumber: 'A2',
          status: '已入住',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        }
      },
      { registry, bitableClient: existingClient.bitableClient }
    );
    expect(updated).toMatchObject({
      operation: 'pms_base_upsert_reservation_projection',
      status: 'updated',
      projection: {
        roomNumber: 'A2',
        status: '已入住'
      }
    });

    const createdClient = createChineseClient();
    const created = await pms_base_upsert_reservation_projection(
      {
        reservationCode: 'R-201',
        fields: {
          roomNumber: 'B1',
          guestLabel: 'Guest B',
          arrivalDate: '2026-04-29T00:00:00.000Z',
          departureDate: '2026-04-30T00:00:00.000Z',
          status: '已预订',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        }
      },
      { registry, bitableClient: createdClient.bitableClient }
    );
    expect(created).toMatchObject({
      operation: 'pms_base_upsert_reservation_projection',
      status: 'created',
      projection: {
        reservationCode: 'R-201',
        roomNumber: 'B1',
        guestLabel: 'Guest B',
        status: '已预订'
      }
    });
  });

  it('upserts stay projections by backend stay id and resolves linked room by 房号', async () => {
    const createRecord = vi.fn().mockImplementation((request) => Promise.resolve({
      recordId: 'rec_stay_created',
      fields: request.fields
    }));
    const updateRecord = vi.fn().mockImplementation((request) => Promise.resolve({
      recordId: request.recordId,
      fields: request.fields
    }));
    const { registry, bitableClient } = createChineseClient({
      rooms: [{ recordId: 'rec_room_A1', fields: { 房号: 'A1' } }],
      createRecord,
      updateRecord
    });

    const result = await pms_base_upsert_stay_projection(
      {
        stayId: 'stay-res-1-room-A1',
        fields: {
          reservationCode: 'R-A1',
          roomNumber: 'A1',
          status: 'inHouse',
          checkedInAt: '2026-04-28T00:00:00.000Z',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        }
      },
      { registry, bitableClient }
    );

    expect(result).toMatchObject({
      operation: 'pms_base_upsert_stay_projection',
      status: 'created',
      relationStatus: 'fresh',
      warnings: [],
      projection: {
        backendId: 'stay-res-1-room-A1',
        reservationCode: 'R-A1',
        roomNumber: 'A1',
        status: 'inHouse',
        relatedRoom: ['rec_room_A1']
      }
    });
    expect(createRecord).toHaveBeenCalledWith({
      appToken: 'app_token_pms',
      tableId: 'stays_table',
      fields: {
        后端ID: 'stay-res-1-room-A1',
        预订号: 'R-A1',
        房号: 'A1',
        入住状态: 'inHouse',
        入住时间: 1777334400000,
        版本: PMS_BASE_PROJECTION_SCHEMA_VERSION
      }
    });
    expect(updateRecord).toHaveBeenCalledWith({
      appToken: 'app_token_pms',
      tableId: 'stays_table',
      recordId: 'rec_stay_created',
      fields: { 关联房间: ['rec_room_A1'] }
    });
  });

  it('keeps stay row fallback fields when linked-room resolution is stale or caller-supplied', async () => {
    const missingRoom = await pms_base_upsert_stay_projection(
      {
        stayId: 'stay-missing-room',
        fields: {
          reservationCode: 'R-missing-room',
          roomNumber: 'A-missing',
          status: 'inHouse',
          checkedInAt: '2026-04-28T00:00:00.000Z',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        }
      },
      { registry: createChineseRegistry(), bitableClient: createChineseClient().bitableClient }
    );

    expect(missingRoom).toMatchObject({
      status: 'created',
      relationStatus: 'stale',
      warnings: [{ code: 'linked_record_related_record_missing', businessValue: 'A-missing' }],
      projection: {
        backendId: 'stay-missing-room',
        reservationCode: 'R-missing-room',
        roomNumber: 'A-missing',
        status: 'inHouse'
      }
    });

    await expect(
      pms_base_upsert_stay_projection(
        {
          stayId: 'stay-raw-linked-field',
          fields: {
            reservationCode: 'R-raw-linked-field',
            roomNumber: 'A1',
            relatedRoom: ['rec_room_A1'],
            status: 'inHouse',
            checkedInAt: '2026-04-28T00:00:00.000Z',
            schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
          }
        },
        { registry: createChineseRegistry(), bitableClient: createChineseClient({ rooms: [{ recordId: 'rec_room_A1', fields: { 房号: 'A1' } }] }).bitableClient }
      )
    ).rejects.toThrow(/relationship_field_not_allowed:relatedRoom/);

    const rawRelationshipValue = await pms_base_upsert_stay_projection(
      {
        stayId: 'stay-raw-relationship-value',
        fields: {
          reservationCode: 'R-raw-relationship-value',
          roomNumber: 'A1',
          status: 'inHouse',
          checkedInAt: '2026-04-28T00:00:00.000Z',
          schemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
        },
        relationships: { roomNumber: 'rec_room_A1' }
      },
      { registry: createChineseRegistry(), bitableClient: createChineseClient({ rooms: [{ recordId: 'rec_room_A1', fields: { 房号: 'A1' } }] }).bitableClient }
    );

    expect(rawRelationshipValue).toMatchObject({
      status: 'created',
      relationStatus: 'stale',
      warnings: [{ code: 'relationship_business_key_rejected_record_id_shape', relationField: 'relatedRoom' }],
      projection: { backendId: 'stay-raw-relationship-value', roomNumber: 'A1' }
    });
    expect(JSON.stringify(rawRelationshipValue.warnings)).not.toContain('rec_room_A1');
  });


});
