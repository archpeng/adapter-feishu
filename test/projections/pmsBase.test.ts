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

function createChineseRegistry(): PmsBaseProjectionRegistry {
  return parsePmsBaseProjectionRegistry({
    version: 1,
    policy: {
      validateSchemaByDefault: true,
      rejectUnmappedFields: true
    },
    bindings: {
      roomLedger: {
        enabled: true,
        target: { appToken: 'app_token_pms', tableId: 'room_table' },
        fieldMap: {
          backendId: '后端ID',
          roomNumber: '房号',
          roomType: '房型',
          occupancyStatus: '入住状态',
          cleaningStatus: '清洁状态',
          sellableStatus: '可售状态',
          roomCode: '房态码',
          lastOperator: '最后操作人',
          lastReason: '最后原因',
          lastUpdatedAt: '更新时间'
        },
        requiredFields: ['roomNumber', 'roomType', 'occupancyStatus', 'cleaningStatus', 'sellableStatus', 'roomCode', 'lastOperator', 'lastReason', 'lastUpdatedAt'],
        updateAllowedFields: ['backendId', 'occupancyStatus', 'cleaningStatus', 'sellableStatus', 'roomCode', 'lastOperator', 'lastReason', 'lastUpdatedAt']
      },
      operationRequests: {
        enabled: true,
        target: { appToken: 'app_token_pms', tableId: 'operation_table' },
        fieldMap: {
          backendId: '后端ID',
          clientToken: '请求令牌',
          action: '操作类型',
          status: '操作状态',
          roomNumber: '房号',
          operator: '操作人',
          reason: '原因',
          requestedAt: '请求时间',
          payloadJSON: '请求JSON',
          resultJSON: '结果JSON',
          schemaVersion: '版本'
        },
        requiredFields: ['clientToken', 'action', 'status', 'roomNumber', 'operator', 'reason', 'requestedAt', 'schemaVersion'],
        updateAllowedFields: ['backendId', 'status', 'resultJSON', 'schemaVersion']
      },
      housekeepingTasks: {
        enabled: true,
        target: { appToken: 'app_token_pms', tableId: 'housekeeping_table' },
        fieldMap: {
          backendId: '后端ID',
          taskId: '任务ID',
          roomNumber: '房号',
          relatedRoom: '关联房间',
          kind: '任务类型',
          status: '任务状态',
          reason: '原因',
          correlationId: '关联ID',
          createdAt: '创建时间',
          completedAt: '完成时间',
          schemaVersion: '版本'
        },
        requiredFields: ['taskId', 'roomNumber', 'kind', 'status', 'reason', 'correlationId', 'createdAt', 'schemaVersion'],
        updateAllowedFields: ['backendId', 'relatedRoom', 'status', 'reason', 'completedAt', 'schemaVersion']
      },
      maintenanceTickets: {
        enabled: true,
        target: { appToken: 'app_token_pms', tableId: 'maintenance_table' },
        fieldMap: {
          backendId: '后端ID',
          ticketId: '工单ID',
          roomNumber: '房号',
          relatedRoom: '关联房间',
          status: '工单状态',
          severity: '严重级别',
          stopSellRequested: '是否停售',
          reason: '维修备注',
          correlationId: '关联ID',
          createdAt: '创建时间',
          resolvedAt: '完成时间',
          schemaVersion: '版本'
        },
        requiredFields: ['ticketId', 'roomNumber', 'status', 'severity', 'stopSellRequested', 'reason', 'correlationId', 'createdAt', 'schemaVersion'],
        updateAllowedFields: ['backendId', 'relatedRoom', 'status', 'resolvedAt', 'schemaVersion']
      },
      reservations: {
        enabled: true,
        target: { appToken: 'app_token_pms', tableId: 'reservation_table' },
        fieldMap: {
          backendId: '后端ID',
          reservationCode: '预订号',
          roomNumber: '房号',
          relatedRoom: '关联房间',
          guestLabel: '客人',
          arrivalDate: '到店日期',
          departureDate: '离店日期',
          status: '预订状态',
          schemaVersion: '版本'
        },
        requiredFields: ['reservationCode', 'guestLabel', 'arrivalDate', 'departureDate', 'status', 'schemaVersion'],
        updateAllowedFields: ['backendId', 'roomNumber', 'relatedRoom', 'guestLabel', 'arrivalDate', 'departureDate', 'status', 'schemaVersion']
      },
      inventoryCalendar: {
        enabled: true,
        target: { appToken: 'app_token_pms', tableId: 'inventory_table' },
        fieldMap: {
          backendId: '后端ID',
          intervalKey: '库存区间键',
          propertyId: '门店ID',
          roomId: '房间ID',
          roomNumber: '房号',
          relatedRoom: '关联房间',
          roomTypeId: '房型ID',
          roomType: '房型',
          startDate: '开始日期',
          endDate: '结束日期',
          calendarKind: '日历状态',
          sellableStatus: '可售状态',
          title: '标题',
          sourceRefsJSON: '来源JSON',
          projectionStatus: '投影状态',
          prunedAt: '剪枝时间',
          updatedAt: '更新时间',
          schemaVersion: '版本'
        },
        requiredFields: ['intervalKey', 'propertyId', 'roomId', 'roomNumber', 'startDate', 'endDate', 'calendarKind', 'sellableStatus', 'title', 'sourceRefsJSON', 'projectionStatus', 'updatedAt', 'schemaVersion'],
        updateAllowedFields: ['backendId', 'roomNumber', 'relatedRoom', 'roomTypeId', 'roomType', 'startDate', 'endDate', 'calendarKind', 'sellableStatus', 'title', 'sourceRefsJSON', 'projectionStatus', 'prunedAt', 'updatedAt', 'schemaVersion']
      },
      operationLogs: {
        enabled: true,
        target: { appToken: 'app_token_pms', tableId: 'operation_log_table' },
        fieldMap: {
          backendId: '后端ID',
          auditId: '审计ID',
          commandType: '操作类型',
          roomNumber: '房号',
          relatedRoom: '关联房间',
          relatedOperationRequest: '关联操作请求',
          actor: '操作人',
          source: '来源',
          reason: '原因',
          idempotencyKey: '幂等键',
          correlationId: '关联ID',
          occurredAt: '发生时间',
          domainEventTypes: '领域事件',
          payloadJSON: '载荷JSON',
          schemaVersion: '版本'
        },
        requiredFields: ['auditId', 'commandType', 'roomNumber', 'actor', 'source', 'reason', 'idempotencyKey', 'correlationId', 'occurredAt', 'domainEventTypes', 'schemaVersion'],
        updateAllowedFields: []
      },
      projectionStatus: {
        enabled: true,
        target: { appToken: 'app_token_pms', tableId: 'projection_status_table' },
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
        },
        requiredFields: ['backendId', 'projectionName', 'aggregateKey', 'status', 'attemptCount', 'updatedAt', 'schemaVersion'],
        updateAllowedFields: ['projectionName', 'aggregateKey', 'status', 'attemptCount', 'lastProjectedAt', 'lastErrorSummary', 'updatedAt', 'schemaVersion']
      }
    }
  });
}

function createChineseClient(options: {
  rooms?: Array<{ recordId?: string; fields: Record<string, unknown> }>;
  operationRequests?: Array<{ recordId?: string; fields: Record<string, unknown> }>;
  housekeepingTasks?: Array<{ recordId?: string; fields: Record<string, unknown> }>;
  maintenanceTickets?: Array<{ recordId?: string; fields: Record<string, unknown> }>;
  reservations?: Array<{ recordId?: string; fields: Record<string, unknown> }>;
  inventoryCalendar?: Array<{ recordId?: string; fields: Record<string, unknown> }>;
  projectionStatus?: Array<{ recordId?: string; fields: Record<string, unknown> }>;
  missingFieldName?: string;
  createRecord?: ReturnType<typeof vi.fn>;
  updateRecord?: ReturnType<typeof vi.fn>;
} = {}) {
  const registry = createChineseRegistry();
  const fieldNamesByTable = new Map(
    Object.values(registry.bindings).map((binding) => [binding.target.tableId, Object.values(binding.fieldMap)])
  );
  const recordsByTable = new Map<string, Array<{ recordId?: string; fields: Record<string, unknown> }>>([
    ['room_table', options.rooms ?? []],
    ['operation_table', options.operationRequests ?? []],
    ['housekeeping_table', options.housekeepingTasks ?? []],
    ['maintenance_table', options.maintenanceTickets ?? []],
    ['reservation_table', options.reservations ?? []],
    ['inventory_table', options.inventoryCalendar ?? []],
    ['projection_status_table', options.projectionStatus ?? []]
  ]);
  const listTableFields = vi.fn().mockImplementation(({ tableId }: { tableId: string }) => Promise.resolve({
    items: (fieldNamesByTable.get(tableId) ?? [])
      .filter((fieldName) => fieldName !== options.missingFieldName)
      .map((fieldName) => ({ fieldName })),
    hasMore: false
  }));
  const listRecords = vi.fn().mockImplementation(({ tableId }: { tableId: string }) => Promise.resolve({
    items: recordsByTable.get(tableId) ?? [],
    hasMore: false
  }));
  const updateRecord = options.updateRecord ?? vi.fn().mockImplementation((request) => Promise.resolve({
    recordId: request.recordId,
    fields: request.fields
  }));
  const createRecord = options.createRecord ?? vi.fn().mockImplementation((request) => Promise.resolve({
    recordId: 'rec_created',
    fields: request.fields
  }));

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
