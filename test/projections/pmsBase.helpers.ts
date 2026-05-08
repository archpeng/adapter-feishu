import { readFileSync } from 'node:fs';
import { vi } from 'vitest';
import {
  PMS_BASE_PROJECTION_SCHEMA_VERSION,
  parsePmsBaseProjectionRegistry,
  type PmsBaseProjectionRegistry
} from '../../src/projections/pmsBase.js';

export function createRegistry(): PmsBaseProjectionRegistry {
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

export function createClient(options: {
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

export function createChineseRegistry(): PmsBaseProjectionRegistry {
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
      stays: {
        enabled: true,
        target: { appToken: 'app_token_pms', tableId: 'stays_table' },
        fieldMap: {
          backendId: '后端ID',
          reservationCode: '预订号',
          roomNumber: '房号',
          relatedRoom: '关联房间',
          status: '入住状态',
          checkedInAt: '入住时间',
          checkedOutAt: '离店时间',
          schemaVersion: '版本'
        },
        requiredFields: ['backendId', 'reservationCode', 'roomNumber', 'status', 'checkedInAt', 'schemaVersion'],
        updateAllowedFields: ['reservationCode', 'roomNumber', 'relatedRoom', 'status', 'checkedInAt', 'checkedOutAt', 'schemaVersion']
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

export function createChineseClient(options: {
  rooms?: Array<{ recordId?: string; fields: Record<string, unknown> }>;
  operationRequests?: Array<{ recordId?: string; fields: Record<string, unknown> }>;
  housekeepingTasks?: Array<{ recordId?: string; fields: Record<string, unknown> }>;
  maintenanceTickets?: Array<{ recordId?: string; fields: Record<string, unknown> }>;
  reservations?: Array<{ recordId?: string; fields: Record<string, unknown> }>;
  inventoryCalendar?: Array<{ recordId?: string; fields: Record<string, unknown> }>;
  stays?: Array<{ recordId?: string; fields: Record<string, unknown> }>;
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
    ['stays_table', options.stays ?? []],
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

export const rooms = [
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

export const operations = [
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
