import { describe, expect, it, vi } from 'vitest';
import { dispatchPmsBaseProjectionRequest } from '../../src/server/pmsBaseProjection.js';
import { parsePmsBaseProjectionRegistry } from '../../src/projections/pmsBase.js';

function createRegistry() {
  return parsePmsBaseProjectionRegistry({
    version: 1,
    policy: {
      validateSchemaByDefault: false,
      rejectUnmappedFields: true
    },
    bindings: {
      roomLedger: {
        enabled: true,
        target: { appToken: 'app_token_pms', tableId: 'room_table' },
        fieldMap: {
          roomNumber: 'RoomNumber',
          roomType: 'RoomType',
          occupancyStatus: 'OccupancyStatus',
          cleaningStatus: 'CleaningStatus',
          sellableStatus: 'SellableStatus',
          roomCode: 'RoomCode',
          lastOperator: 'LastOperator',
          lastReason: 'LastReason',
          lastUpdatedAt: 'LastUpdatedAt'
        },
        requiredFields: ['roomNumber', 'roomType', 'occupancyStatus', 'cleaningStatus', 'sellableStatus', 'roomCode', 'lastOperator', 'lastReason', 'lastUpdatedAt'],
        updateAllowedFields: ['occupancyStatus', 'cleaningStatus', 'sellableStatus', 'roomCode', 'lastOperator', 'lastReason', 'lastUpdatedAt']
      },
      operationRequests: {
        enabled: true,
        target: { appToken: 'app_token_pms', tableId: 'operation_table' },
        fieldMap: {
          clientToken: 'ClientToken',
          action: 'Action',
          status: 'Status',
          roomNumber: 'RoomNumber',
          operator: 'Operator',
          reason: 'Reason',
          requestedAt: 'RequestedAt',
          payloadJSON: 'PayloadJSON',
          resultJSON: 'ResultJSON'
        },
        requiredFields: ['clientToken', 'action', 'status', 'roomNumber', 'operator', 'reason', 'requestedAt'],
        updateAllowedFields: ['status', 'resultJSON']
      },
      reservations: {
        enabled: true,
        target: { appToken: 'app_token_pms', tableId: 'reservation_table' },
        fieldMap: {
          reservationCode: 'ReservationCode',
          roomNumber: 'RoomNumber',
          guestLabel: 'GuestLabel',
          arrivalDate: 'ArrivalDate',
          departureDate: 'DepartureDate',
          status: 'Status',
          schemaVersion: 'SchemaVersion'
        },
        requiredFields: ['reservationCode', 'guestLabel', 'arrivalDate', 'departureDate', 'status', 'schemaVersion'],
        updateAllowedFields: ['roomNumber', 'guestLabel', 'arrivalDate', 'departureDate', 'status', 'schemaVersion']
      },
      inventoryCalendar: {
        enabled: true,
        target: { appToken: 'app_token_pms', tableId: 'inventory_table' },
        fieldMap: {
          intervalKey: 'IntervalKey',
          propertyId: 'PropertyId',
          roomId: 'RoomId',
          roomNumber: 'RoomNumber',
          roomTypeId: 'RoomTypeId',
          roomType: 'RoomType',
          startDate: 'StartDate',
          endDate: 'EndDate',
          calendarKind: 'CalendarKind',
          sellableStatus: 'SellableStatus',
          title: 'Title',
          sourceRefsJSON: 'SourceRefsJSON',
          projectionStatus: 'ProjectionStatus',
          prunedAt: 'PrunedAt',
          updatedAt: 'UpdatedAt',
          schemaVersion: 'SchemaVersion'
        },
        requiredFields: ['intervalKey', 'propertyId', 'roomId', 'roomNumber', 'startDate', 'endDate', 'calendarKind', 'sellableStatus', 'title', 'sourceRefsJSON', 'projectionStatus', 'updatedAt', 'schemaVersion'],
        updateAllowedFields: ['roomNumber', 'roomTypeId', 'roomType', 'startDate', 'endDate', 'calendarKind', 'sellableStatus', 'title', 'sourceRefsJSON', 'projectionStatus', 'prunedAt', 'updatedAt', 'schemaVersion']
      },
      operationLogs: {
        enabled: true,
        target: { appToken: 'app_token_pms', tableId: 'operation_log_table' },
        fieldMap: {
          auditId: 'AuditId',
          commandType: 'CommandType',
          roomNumber: 'RoomNumber',
          actor: 'Actor',
          source: 'Source',
          reason: 'Reason',
          idempotencyKey: 'IdempotencyKey',
          correlationId: 'CorrelationId',
          occurredAt: 'OccurredAt',
          domainEventTypes: 'DomainEventTypes',
          payloadJSON: 'PayloadJSON',
          schemaVersion: 'SchemaVersion'
        },
        requiredFields: ['auditId', 'commandType', 'roomNumber', 'actor', 'source', 'reason', 'idempotencyKey', 'correlationId', 'occurredAt', 'domainEventTypes', 'schemaVersion'],
        updateAllowedFields: []
      }
    }
  });
}

function createClient() {
  const updateRecord = vi.fn().mockImplementation((request) => {
    return Promise.resolve({
      recordId: request.recordId,
      fields: {
        RoomNumber: '101',
        ...request.fields
      }
    });
  });

  return {
    listTableFields: vi.fn(),
    listRecords: vi.fn().mockResolvedValue({
      items: [
        {
          recordId: 'rec_room_101',
          fields: {
            RoomNumber: '101',
            OccupancyStatus: 'Vacant',
            CleaningStatus: 'Clean'
          }
        }
      ],
      hasMore: false
    }),
    updateRecord,
    createRecord: vi.fn().mockImplementation((request) => {
      return Promise.resolve({
        recordId: 'rec_operation_created',
        fields: request.fields
      });
    })
  };
}

describe('dispatchPmsBaseProjectionRequest', () => {
  it('requires auth when configured', async () => {
    const response = await dispatchPmsBaseProjectionRequest(
      {
        method: 'POST',
        pathname: '/providers/pms-base',
        rawBody: JSON.stringify({ operation: 'pms_base_dashboard_projection' })
      },
      {
        bitableClient: createClient(),
        registry: createRegistry(),
        authToken: 'pms-base-token-1'
      }
    );

    expect(response).toEqual({
      statusCode: 401,
      body: {
        code: 401,
        message: 'unauthorized'
      }
    });
  });

  it('rejects caller-supplied targets and arbitrary operation names', async () => {
    const targetResponse = await dispatchPmsBaseProjectionRequest(
      {
        method: 'POST',
        pathname: '/providers/pms-base',
        rawBody: JSON.stringify({
          operation: 'pms_base_update_room_projection',
          roomNumber: '101',
          target: { appToken: 'caller_target', tableId: 'caller_table' },
          fields: { occupancyStatus: 'InHouse' }
        })
      },
      {
        bitableClient: createClient(),
        registry: createRegistry()
      }
    );
    const arbitraryResponse = await dispatchPmsBaseProjectionRequest(
      {
        method: 'POST',
        pathname: '/providers/pms-base',
        rawBody: JSON.stringify({
          operation: 'bitable_update_record',
          fields: { AnyField: 'any value' }
        })
      },
      {
        bitableClient: createClient(),
        registry: createRegistry()
      }
    );
    const wrongPathResponse = await dispatchPmsBaseProjectionRequest(
      {
        method: 'POST',
        pathname: '/providers/bitable/update',
        rawBody: JSON.stringify({ operation: 'pms_base_update_room_projection' })
      },
      {
        bitableClient: createClient(),
        registry: createRegistry()
      }
    );

    expect(targetResponse).toEqual({
      statusCode: 400,
      body: {
        code: 400,
        message: 'invalid_payload',
        errors: ['target_not_allowed:target']
      }
    });
    expect(arbitraryResponse).toEqual({
      statusCode: 400,
      body: {
        code: 400,
        message: 'invalid_payload',
        errors: ['operation_not_allowed:bitable_update_record']
      }
    });
    expect(wrongPathResponse).toEqual({
      statusCode: 404,
      body: {
        code: 404,
        message: 'not_found'
      }
    });
  });

  it('updates a room projection through the business-shaped wrapper only', async () => {
    const bitableClient = createClient();

    const response = await dispatchPmsBaseProjectionRequest(
      {
        method: 'POST',
        pathname: '/providers/pms-base',
        headers: {
          authorization: 'Bearer pms-base-token-1'
        },
        rawBody: JSON.stringify({
          operation: 'pms_base_update_room_projection',
          roomNumber: '101',
          fields: {
            occupancyStatus: 'InHouse',
            cleaningStatus: 'Clean'
          }
        })
      },
      {
        bitableClient,
        registry: createRegistry(),
        authToken: 'pms-base-token-1'
      }
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      code: 0,
      operation: 'pms_base_update_room_projection',
      status: 'updated',
      updatedFields: ['occupancyStatus', 'cleaningStatus']
    });
    expect(bitableClient.updateRecord).toHaveBeenCalledWith({
      appToken: 'app_token_pms',
      tableId: 'room_table',
      recordId: 'rec_room_101',
      fields: {
        OccupancyStatus: 'InHouse',
        CleaningStatus: 'Clean'
      }
    });
  });

  it('upserts OperationRequest rows through pms-base dispatch without accepting raw targets', async () => {
    const bitableClient = createClient();

    const response = await dispatchPmsBaseProjectionRequest(
      {
        method: 'POST',
        pathname: '/providers/pms-base',
        headers: {
          authorization: 'Bearer pms-base-token-1'
        },
        rawBody: JSON.stringify({
          operation: 'pms_base_upsert_operation_request',
          clientToken: 'business-checkin-0308',
          fields: {
            action: 'CHECK_IN',
            status: 'DryRunReady',
            roomNumber: '0308',
            operator: 'frontdesk-alpha',
            reason: 'guest arrival',
            requestedAt: '2026-04-28T00:00:00.000Z',
            payloadJSON: '{"source":"ai-pms"}',
            resultJSON: '{"phase":"dryRun"}'
          }
        })
      },
      {
        bitableClient,
        registry: createRegistry(),
        authToken: 'pms-base-token-1'
      }
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      code: 0,
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
        'resultJSON'
      ]
    });
    expect(bitableClient.createRecord).toHaveBeenCalledWith({
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
        PayloadJSON: '{"source":"ai-pms"}',
        ResultJSON: '{"phase":"dryRun"}'
      }
    });
  });

  it('upserts RoomLedger rows through pms-base dispatch by business key', async () => {
    const bitableClient = createClient();

    const response = await dispatchPmsBaseProjectionRequest(
      {
        method: 'POST',
        pathname: '/providers/pms-base',
        headers: {
          authorization: 'Bearer pms-base-token-1'
        },
        rawBody: JSON.stringify({
          operation: 'pms_base_upsert_room_projection',
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
        })
      },
      {
        bitableClient,
        registry: createRegistry(),
        authToken: 'pms-base-token-1'
      }
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      code: 0,
      operation: 'pms_base_upsert_room_projection',
      status: 'created'
    });
    expect(bitableClient.createRecord).toHaveBeenCalledWith({
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
  });

  it('upserts reservation rows through pms-base dispatch by reservationCode', async () => {
    const bitableClient = createClient();

    const response = await dispatchPmsBaseProjectionRequest(
      {
        method: 'POST',
        pathname: '/providers/pms-base',
        headers: {
          authorization: 'Bearer pms-base-token-1'
        },
        rawBody: JSON.stringify({
          operation: 'pms_base_upsert_reservation_projection',
          reservationCode: 'R-1001',
          fields: {
            roomNumber: '1001',
            guestLabel: 'Guest A',
            arrivalDate: '2026-04-29T00:00:00.000Z',
            departureDate: '2026-04-30T00:00:00.000Z',
            status: 'Booked',
            schemaVersion: 'pms-dashboard-mvp-v1'
          }
        })
      },
      {
        bitableClient,
        registry: createRegistry(),
        authToken: 'pms-base-token-1'
      }
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      code: 0,
      operation: 'pms_base_upsert_reservation_projection',
      status: 'created'
    });
    expect(bitableClient.createRecord).toHaveBeenCalledWith({
      appToken: 'app_token_pms',
      tableId: 'reservation_table',
      fields: {
        ReservationCode: 'R-1001',
        RoomNumber: '1001',
        GuestLabel: 'Guest A',
        ArrivalDate: 1777420800000,
        DepartureDate: 1777507200000,
        Status: 'Booked',
        SchemaVersion: 'pms-dashboard-mvp-v1'
      }
    });
  });

  it('upserts and prunes inventory calendar rows through pms-base dispatch', async () => {
    const createRecord = vi.fn().mockImplementation((request) => Promise.resolve({
      recordId: 'rec_inventory_created',
      fields: request.fields
    }));
    const updateRecord = vi.fn().mockImplementation((request) => Promise.resolve({
      recordId: request.recordId,
      fields: {
        IntervalKey: 'inventory-room-A2-2026-04-28-blocked',
        ...request.fields
      }
    }));
    const inventoryRecord = {
      recordId: 'rec_inventory_existing',
      fields: {
        IntervalKey: 'inventory-room-A2-2026-04-28-blocked',
        ProjectionStatus: 'Active'
      }
    };
    const bitableClient = {
      ...createClient(),
      createRecord,
      updateRecord,
      listRecords: vi.fn().mockImplementation(({ tableId }: { tableId: string }) => Promise.resolve({
        items: tableId === 'inventory_table' ? [] : [],
        hasMore: false
      }))
    };

    const upsertResponse = await dispatchPmsBaseProjectionRequest(
      {
        method: 'POST',
        pathname: '/providers/pms-base',
        headers: { authorization: 'Bearer pms-base-token-1' },
        rawBody: JSON.stringify({
          operation: 'pms_base_upsert_inventory_calendar_projection',
          intervalKey: 'inventory-room-A2-2026-04-28-blocked',
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
            schemaVersion: 'pms-dashboard-mvp-v1'
          }
        })
      },
      { bitableClient, registry: createRegistry(), authToken: 'pms-base-token-1' }
    );

    bitableClient.listRecords.mockImplementation(({ tableId }: { tableId: string }) => Promise.resolve({
      items: tableId === 'inventory_table' ? [inventoryRecord] : [],
      hasMore: false
    }));
    const pruneResponse = await dispatchPmsBaseProjectionRequest(
      {
        method: 'POST',
        pathname: '/providers/pms-base',
        headers: { authorization: 'Bearer pms-base-token-1' },
        rawBody: JSON.stringify({
          operation: 'pms_base_prune_inventory_calendar_projection',
          intervalKey: 'inventory-room-A2-2026-04-28-blocked',
          fields: { updatedAt: '2026-04-28T00:02:00.000Z' }
        })
      },
      {
        bitableClient,
        registry: createRegistry(),
        authToken: 'pms-base-token-1',
        now: () => '2026-04-28T00:03:00.000Z'
      }
    );

    expect(upsertResponse).toMatchObject({
      statusCode: 200,
      body: { code: 0, operation: 'pms_base_upsert_inventory_calendar_projection', status: 'created' }
    });
    expect(pruneResponse).toMatchObject({
      statusCode: 200,
      body: { code: 0, operation: 'pms_base_prune_inventory_calendar_projection', status: 'pruned' }
    });
    expect(createRecord).toHaveBeenCalledWith({
      appToken: 'app_token_pms',
      tableId: 'inventory_table',
      fields: {
        IntervalKey: 'inventory-room-A2-2026-04-28-blocked',
        PropertyId: 'property-small-hotel',
        RoomId: 'room-A2',
        RoomNumber: 'A2',
        StartDate: 1777334400000,
        EndDate: 1777420800000,
        CalendarKind: 'blocked',
        SellableStatus: 'outOfOrder',
        Title: 'A2 blocked',
        SourceRefsJSON: '[]',
        ProjectionStatus: 'Active',
        UpdatedAt: 1777334400000,
        SchemaVersion: 'pms-dashboard-mvp-v1'
      }
    });
    expect(updateRecord).toHaveBeenCalledWith({
      appToken: 'app_token_pms',
      tableId: 'inventory_table',
      recordId: 'rec_inventory_existing',
      fields: {
        UpdatedAt: 1777334520000,
        ProjectionStatus: 'Pruned',
        PrunedAt: 1777334580000,
        SchemaVersion: 'pms-dashboard-mvp-v1'
      }
    });
  });

  it('appends OperationLog rows through pms-base dispatch', async () => {
    const bitableClient = createClient();

    const response = await dispatchPmsBaseProjectionRequest(
      {
        method: 'POST',
        pathname: '/providers/pms-base',
        headers: {
          authorization: 'Bearer pms-base-token-1'
        },
        rawBody: JSON.stringify({
          operation: 'pms_base_append_operation_log',
          auditId: 'audit-checkout-1001',
          fields: {
            commandType: 'CHECK_OUT',
            roomNumber: '1001',
            actor: 'Sandbox Operator',
            source: 'pms-platform',
            reason: 'guest departure',
            idempotencyKey: 'idem-checkout-1001-confirm',
            correlationId: 'corr-checkout-1001',
            occurredAt: '2026-04-28T00:00:00.000Z',
            domainEventTypes: 'RoomCheckedOut,HousekeepingTaskCreated',
            payloadJSON: '{"ok":true}',
            schemaVersion: 'pms-dashboard-mvp-v1'
          }
        })
      },
      {
        bitableClient,
        registry: createRegistry(),
        authToken: 'pms-base-token-1'
      }
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      code: 0,
      operation: 'pms_base_append_operation_log',
      status: 'created'
    });
    expect(bitableClient.createRecord).toHaveBeenCalledWith({
      appToken: 'app_token_pms',
      tableId: 'operation_log_table',
      fields: {
        AuditId: 'audit-checkout-1001',
        CommandType: 'CHECK_OUT',
        RoomNumber: '1001',
        Actor: 'Sandbox Operator',
        Source: 'pms-platform',
        Reason: 'guest departure',
        IdempotencyKey: 'idem-checkout-1001-confirm',
        CorrelationId: 'corr-checkout-1001',
        OccurredAt: 1777334400000,
        DomainEventTypes: 'RoomCheckedOut,HousekeepingTaskCreated',
        PayloadJSON: '{"ok":true}',
        SchemaVersion: 'pms-dashboard-mvp-v1'
      }
    });
  });
});
