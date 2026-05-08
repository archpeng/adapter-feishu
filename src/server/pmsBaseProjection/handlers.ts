import type { BitableClient } from '../../channels/feishu/bitableClient.js';
import type { JsonRecord } from '../../core/contracts.js';
import {
  type PmsBaseProjectionRegistry,
  type PmsBaseProjectionRelationshipInputs,
  pms_base_append_operation_log,
  pms_base_dashboard_projection,
  pms_base_get_reservation_projection,
  pms_base_get_room_projection,
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
  pms_base_update_room_projection
} from '../../projections/pmsBase.js';
import type { PmsBaseProjectionResponse } from './types.js';

interface PmsBaseProjectionOperationDeps {
  bitableClient: Pick<BitableClient, 'createRecord' | 'listRecords' | 'updateRecord' | 'listTableFields'>;
  registry: PmsBaseProjectionRegistry;
  now?: () => string;
}

type PmsBaseProjectionOperationHandler = (
  payload: JsonRecord,
  deps: PmsBaseProjectionOperationDeps
) => Promise<PmsBaseProjectionResponse>;

const operationHandlers: Record<string, PmsBaseProjectionOperationHandler> = {
  async pms_base_get_room_projection(payload, deps) {
    const roomNumber = stringField(payload, 'roomNumber');
    if (!roomNumber) {
      return invalidPayloadResponse(['room_number_required']);
    }
    return okResponse(await pms_base_get_room_projection({ roomNumber }, deps));
  },

  async pms_base_dashboard_projection(payload, deps) {
    return okResponse(await pms_base_dashboard_projection({ generatedAt: stringField(payload, 'generatedAt') }, deps));
  },

  async pms_base_update_operation_result(payload, deps) {
    const clientToken = stringField(payload, 'clientToken');
    const fields = recordField(payload, 'fields');
    if (!clientToken || !fields) {
      return invalidPayloadResponse([
        ...(!clientToken ? ['client_token_required'] : []),
        ...(!fields ? ['fields_required'] : [])
      ]);
    }
    return okResponse(await pms_base_update_operation_result({ clientToken, fields }, deps));
  },

  async pms_base_upsert_operation_request(payload, deps) {
    const clientToken = stringField(payload, 'clientToken');
    const fields = recordField(payload, 'fields');
    if (!clientToken || !fields) {
      return invalidPayloadResponse([
        ...(!clientToken ? ['client_token_required'] : []),
        ...(!fields ? ['fields_required'] : [])
      ]);
    }
    return okResponse(await pms_base_upsert_operation_request({ clientToken, fields }, deps));
  },

  async pms_base_update_room_projection(payload, deps) {
    const roomNumber = stringField(payload, 'roomNumber');
    const fields = recordField(payload, 'fields');
    if (!roomNumber || !fields) {
      return invalidPayloadResponse([
        ...(!roomNumber ? ['room_number_required'] : []),
        ...(!fields ? ['fields_required'] : [])
      ]);
    }
    return okResponse(await pms_base_update_room_projection({ roomNumber, fields }, deps));
  },

  async pms_base_upsert_room_projection(payload, deps) {
    const roomNumber = stringField(payload, 'roomNumber');
    const fields = recordField(payload, 'fields');
    if (!roomNumber || !fields) {
      return invalidPayloadResponse([
        ...(!roomNumber ? ['room_number_required'] : []),
        ...(!fields ? ['fields_required'] : [])
      ]);
    }
    return okResponse(await pms_base_upsert_room_projection({ roomNumber, fields }, deps));
  },

  async pms_base_append_operation_log(payload, deps) {
    const auditId = stringField(payload, 'auditId');
    const fields = recordField(payload, 'fields');
    if (!auditId || !fields) {
      return invalidPayloadResponse([
        ...(!auditId ? ['audit_id_required'] : []),
        ...(!fields ? ['fields_required'] : [])
      ]);
    }
    return okResponse(await pms_base_append_operation_log({ auditId, fields, relationships: relationshipInputsField(payload) }, deps));
  },

  async pms_base_upsert_housekeeping_task_projection(payload, deps) {
    const taskId = stringField(payload, 'taskId');
    const fields = recordField(payload, 'fields');
    if (!taskId || !fields) {
      return invalidPayloadResponse([
        ...(!taskId ? ['task_id_required'] : []),
        ...(!fields ? ['fields_required'] : [])
      ]);
    }
    return okResponse(await pms_base_upsert_housekeeping_task_projection({ taskId, fields, relationships: relationshipInputsField(payload) }, deps));
  },

  async pms_base_upsert_maintenance_ticket_projection(payload, deps) {
    const ticketId = stringField(payload, 'ticketId');
    const fields = recordField(payload, 'fields');
    if (!ticketId || !fields) {
      return invalidPayloadResponse([
        ...(!ticketId ? ['ticket_id_required'] : []),
        ...(!fields ? ['fields_required'] : [])
      ]);
    }
    return okResponse(await pms_base_upsert_maintenance_ticket_projection({ ticketId, fields, relationships: relationshipInputsField(payload) }, deps));
  },

  async pms_base_get_reservation_projection(payload, deps) {
    const reservationCode = stringField(payload, 'reservationCode');
    if (!reservationCode) {
      return invalidPayloadResponse(['reservation_code_required']);
    }
    return okResponse(await pms_base_get_reservation_projection({ reservationCode }, deps));
  },

  async pms_base_upsert_reservation_projection(payload, deps) {
    const reservationCode = stringField(payload, 'reservationCode');
    const fields = recordField(payload, 'fields');
    if (!reservationCode || !fields) {
      return invalidPayloadResponse([
        ...(!reservationCode ? ['reservation_code_required'] : []),
        ...(!fields ? ['fields_required'] : [])
      ]);
    }
    return okResponse(await pms_base_upsert_reservation_projection({ reservationCode, fields, relationships: relationshipInputsField(payload) }, deps));
  },

  async pms_base_upsert_stay_projection(payload, deps) {
    const stayId = stringField(payload, 'stayId');
    const fields = recordField(payload, 'fields');
    if (!stayId || !fields) {
      return invalidPayloadResponse([
        ...(!stayId ? ['stay_id_required'] : []),
        ...(!fields ? ['fields_required'] : [])
      ]);
    }
    return okResponse(await pms_base_upsert_stay_projection({ stayId, fields, relationships: relationshipInputsField(payload) }, deps));
  },

  async pms_base_upsert_inventory_calendar_projection(payload, deps) {
    const intervalKey = stringField(payload, 'intervalKey');
    const fields = recordField(payload, 'fields');
    if (!intervalKey || !fields) {
      return invalidPayloadResponse([
        ...(!intervalKey ? ['interval_key_required'] : []),
        ...(!fields ? ['fields_required'] : [])
      ]);
    }
    return okResponse(await pms_base_upsert_inventory_calendar_projection({ intervalKey, fields, relationships: relationshipInputsField(payload) }, deps));
  },

  async pms_base_prune_inventory_calendar_projection(payload, deps) {
    const intervalKey = stringField(payload, 'intervalKey');
    if (!intervalKey) {
      return invalidPayloadResponse(['interval_key_required']);
    }
    return okResponse(await pms_base_prune_inventory_calendar_projection({ intervalKey, fields: recordField(payload, 'fields') }, deps));
  },

  async pms_base_upsert_projection_status(payload, deps) {
    const projectionKey = stringField(payload, 'projectionKey');
    const fields = recordField(payload, 'fields');
    if (!projectionKey || !fields) {
      return invalidPayloadResponse([
        ...(!projectionKey ? ['projection_key_required'] : []),
        ...(!fields ? ['fields_required'] : [])
      ]);
    }
    return okResponse(await pms_base_upsert_projection_status({ projectionKey, fields }, deps));
  },

  async pms_base_prune_projection_status(payload, deps) {
    const projectionKey = stringField(payload, 'projectionKey');
    if (!projectionKey) {
      return invalidPayloadResponse(['projection_key_required']);
    }
    return okResponse(await pms_base_prune_projection_status({ projectionKey, fields: recordField(payload, 'fields') }, deps));
  },

  async pms_base_today_arrivals_projection(payload, deps) {
    const businessDate = stringField(payload, 'businessDate');
    if (!businessDate) {
      return invalidPayloadResponse(['business_date_required']);
    }
    return okResponse(await pms_base_today_arrivals_projection({ businessDate }, deps));
  },

  async pms_base_today_departures_projection(payload, deps) {
    const businessDate = stringField(payload, 'businessDate');
    if (!businessDate) {
      return invalidPayloadResponse(['business_date_required']);
    }
    return okResponse(await pms_base_today_departures_projection({ businessDate }, deps));
  }
};

export async function dispatchPmsBaseProjectionOperation(
  operation: string,
  payload: JsonRecord,
  deps: PmsBaseProjectionOperationDeps
): Promise<PmsBaseProjectionResponse> {
  const handler = operationHandlers[operation];
  if (!handler) {
    return invalidPayloadResponse([`operation_not_allowed:${operation}`]);
  }
  return handler(payload, deps);
}

function okResponse(result: object): PmsBaseProjectionResponse {
  return { statusCode: 200, body: { code: 0, ...result } };
}

function invalidPayloadResponse(errors: string[]): PmsBaseProjectionResponse {
  return {
    statusCode: 400,
    body: {
      code: 400,
      message: 'invalid_payload',
      errors
    }
  };
}

function recordField(value: JsonRecord, key: string): Record<string, unknown> | undefined {
  const candidate = value[key];
  return isRecord(candidate) ? (candidate as Record<string, unknown>) : undefined;
}

function relationshipInputsField(value: JsonRecord): PmsBaseProjectionRelationshipInputs | undefined {
  const relationships = recordField(value, 'relationships');
  if (!relationships) {
    return undefined;
  }

  return {
    roomNumber: stringField(relationships, 'roomNumber'),
    operationClientToken: stringField(relationships, 'operationClientToken')
  };
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const candidate = value[key];
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
