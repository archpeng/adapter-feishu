import { describe, expect, it, vi } from 'vitest';
import {
  PMS_BASE_PROJECTION_SCHEMA_VERSION,
  parsePmsBaseProjectionRegistry,
  pms_base_dashboard_projection,
  pms_base_get_room_projection,
  pms_base_append_operation_log,
  pms_base_upsert_operation_request,
  pms_base_upsert_room_projection,
  pms_base_update_operation_result,
  pms_base_update_room_projection,
  type PmsBaseProjectionRegistry
} from '../../src/projections/pmsBase.js';

function createRegistry(): PmsBaseProjectionRegistry {
  return parsePmsBaseProjectionRegistry({
    version: 1,
    policy: {
      validateSchemaByDefault: true,
      rejectUnmappedFields: true
    },
    bindings: {
      roomLedger: {
        enabled: true,
        target: {
          appToken: 'app_token_pms',
          tableId: 'room_table'
        },
        fieldMap: {
          roomNumber: 'RoomNumber',
          roomType: 'RoomType',
          occupancyStatus: 'OccupancyStatus',
          cleaningStatus: 'CleaningStatus',
          sellableStatus: 'SellableStatus',
          roomCode: 'RoomCode',
          currentReservationCode: 'CurrentReservationCode',
          lastOperator: 'LastOperator',
          lastReason: 'LastReason',
          lastUpdatedAt: 'LastUpdatedAt'
        },
        requiredFields: [
          'roomNumber',
          'roomType',
          'occupancyStatus',
          'cleaningStatus',
          'sellableStatus',
          'roomCode',
          'lastOperator',
          'lastReason',
          'lastUpdatedAt'
        ],
        updateAllowedFields: [
          'occupancyStatus',
          'cleaningStatus',
          'sellableStatus',
          'roomCode',
          'currentReservationCode',
          'lastOperator',
          'lastReason',
          'lastUpdatedAt'
        ]
      },
      operationRequests: {
        enabled: true,
        target: {
          appToken: 'app_token_pms',
          tableId: 'operation_table'
        },
        fieldMap: {
          clientToken: 'ClientToken',
          action: 'Action',
          status: 'Status',
          roomNumber: 'RoomNumber',
          operator: 'Operator',
          reason: 'Reason',
          requestedAt: 'RequestedAt',
          payloadJSON: 'PayloadJSON',
          resultJSON: 'ResultJSON',
          schemaVersion: 'SchemaVersion'
        },
        requiredFields: [
          'clientToken',
          'action',
          'status',
          'roomNumber',
          'operator',
          'reason',
          'requestedAt',
          'schemaVersion'
        ],
        updateAllowedFields: ['status', 'resultJSON', 'schemaVersion']
      },
      operationLogs: {
        enabled: true,
        target: {
          appToken: 'app_token_pms',
          tableId: 'operation_log_table'
        },
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
        requiredFields: [
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
          'schemaVersion'
        ],
        updateAllowedFields: []
      }
    }
  });
}

function createClient(options: {
  rooms?: Array<{ recordId?: string; fields: Record<string, unknown> }>;
  operations?: Array<{ recordId?: string; fields: Record<string, unknown> }>;
  operationLogs?: Array<{ recordId?: string; fields: Record<string, unknown> }>;
  missingFieldName?: string;
  createRecord?: ReturnType<typeof vi.fn>;
  updateRecord?: ReturnType<typeof vi.fn>;
} = {}) {
  const registry = createRegistry();
  const roomFields = Object.values(registry.bindings.roomLedger.fieldMap);
  const operationFields = Object.values(registry.bindings.operationRequests.fieldMap);
  const operationLogFields = Object.values(registry.bindings.operationLogs.fieldMap);
  const listTableFields = vi.fn().mockImplementation(({ tableId }: { tableId: string }) => {
    const names = (tableId === 'room_table' ? roomFields : tableId === 'operation_log_table' ? operationLogFields : operationFields).filter(
      (fieldName) => fieldName !== options.missingFieldName
    );
    return Promise.resolve({
      items: names.map((fieldName) => ({ fieldName })),
      hasMore: false
    });
  });
  const listRecords = vi.fn().mockImplementation(({ tableId }: { tableId: string }) => {
    return Promise.resolve({
      items: tableId === 'room_table'
        ? options.rooms ?? []
        : tableId === 'operation_log_table'
          ? options.operationLogs ?? []
          : options.operations ?? [],
      hasMore: false
    });
  });
  const updateRecord = options.updateRecord ?? vi.fn().mockImplementation((request) => {
    return Promise.resolve({
      recordId: request.recordId,
      fields: request.fields
    });
  });
  const createRecord = options.createRecord ?? vi.fn().mockImplementation((request) => {
    return Promise.resolve({
      recordId: 'rec_operation_created',
      fields: request.fields
    });
  });

  return {
    registry,
    bitableClient: {
      createRecord,
      listTableFields,
      listRecords,
      updateRecord
    }
  };
}

const rooms = [
  {
    recordId: 'rec_room_101',
    fields: {
      RoomNumber: '101',
      RoomType: 'standard',
      OccupancyStatus: 'Vacant',
      CleaningStatus: 'Clean',
      SellableStatus: 'Sellable',
      RoomCode: 'VC',
      LastOperator: 'frontdesk-alpha',
      LastReason: 'pms read model projection',
      LastUpdatedAt: '2026-04-27T00:00:00.000Z'
    }
  },
  {
    recordId: 'rec_room_102',
    fields: {
      RoomNumber: '102',
      RoomType: 'standard',
      OccupancyStatus: 'Vacant',
      CleaningStatus: 'Dirty',
      SellableStatus: 'Sellable',
      RoomCode: 'VD',
      LastOperator: 'frontdesk-alpha',
      LastReason: 'checkout projection',
      LastUpdatedAt: '2026-04-27T00:00:00.000Z'
    }
  },
  {
    recordId: 'rec_room_103',
    fields: {
      RoomNumber: '103',
      RoomType: 'family',
      OccupancyStatus: 'InHouse',
      CleaningStatus: 'Clean',
      SellableStatus: 'StopSell',
      RoomCode: 'OOO',
      LastOperator: 'frontdesk-alpha',
      LastReason: 'maintenance projection',
      LastUpdatedAt: '2026-04-27T00:00:00.000Z'
    }
  }
];

const operations = [
  {
    recordId: 'rec_operation_1',
    fields: {
      ClientToken: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      Action: 'CHECK_IN',
      Status: 'Pending',
      RoomNumber: '101',
      Operator: 'frontdesk-alpha',
      Reason: 'guest arrival',
      RequestedAt: '2026-04-27T00:00:00.000Z',
      SchemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
    }
  },
  {
    recordId: 'rec_operation_2',
    fields: {
      ClientToken: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      Action: 'CHECK_OUT',
      Status: 'Failed',
      RoomNumber: '102',
      Operator: 'frontdesk-alpha',
      Reason: 'guest departure',
      RequestedAt: '2026-04-27T00:01:00.000Z',
      SchemaVersion: PMS_BASE_PROJECTION_SCHEMA_VERSION
    }
  }
];

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
          payloadJSON: '{"source":"ai-pms"}',
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
        PayloadJSON: '{"source":"ai-pms"}',
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
