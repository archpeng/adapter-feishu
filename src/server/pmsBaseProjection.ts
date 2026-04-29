import type { IncomingHttpHeaders } from 'node:http';
import type { BitableClient } from '../channels/feishu/bitableClient.js';
import type { JsonRecord } from '../core/contracts.js';
import {
  PmsBaseProjectionError,
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
  pms_base_update_operation_result,
  pms_base_update_room_projection
} from '../projections/pmsBase.js';

export interface PmsBaseProjectionRequest {
  method?: string;
  pathname?: string;
  headers?: IncomingHttpHeaders;
  rawBody: string;
}

export interface PmsBaseProjectionResponse {
  statusCode: number;
  body: Record<string, unknown>;
}

export interface PmsBaseProjectionDispatchDeps {
  bitableClient: Pick<BitableClient, 'createRecord' | 'listRecords' | 'updateRecord' | 'listTableFields'>;
  registry?: PmsBaseProjectionRegistry;
  authToken?: string;
  now?: () => string;
}

export async function dispatchPmsBaseProjectionRequest(
  request: PmsBaseProjectionRequest,
  deps: PmsBaseProjectionDispatchDeps
): Promise<PmsBaseProjectionResponse> {
  const pathname = request.pathname ?? '/providers/pms-base';
  if (pathname !== '/providers/pms-base') {
    return { statusCode: 404, body: { code: 404, message: 'not_found' } };
  }

  if (request.method !== 'POST') {
    return { statusCode: 405, body: { code: 405, message: 'method_not_allowed' } };
  }

  if (!isAuthorizedPmsBaseRequest(request.headers, deps.authToken)) {
    return { statusCode: 401, body: { code: 401, message: 'unauthorized' } };
  }

  if (!deps.registry) {
    return { statusCode: 503, body: { code: 503, message: 'pms_base_registry_not_configured' } };
  }

  const payload = parseJsonRecord(request.rawBody);
  if (!payload) {
    return { statusCode: 400, body: { code: 400, message: 'invalid_json' } };
  }

  const targetShieldError = firstTargetShieldError(payload);
  if (targetShieldError) {
    return invalidPayloadResponse([targetShieldError]);
  }

  const operation = stringField(payload, 'operation');
  if (!operation) {
    return invalidPayloadResponse(['operation_required']);
  }

  try {
    if (operation === 'pms_base_get_room_projection') {
      const roomNumber = stringField(payload, 'roomNumber');
      if (!roomNumber) {
        return invalidPayloadResponse(['room_number_required']);
      }
      const result = await pms_base_get_room_projection(
        { roomNumber },
        { bitableClient: deps.bitableClient, registry: deps.registry, now: deps.now }
      );
      return { statusCode: 200, body: { code: 0, ...result } };
    }

    if (operation === 'pms_base_dashboard_projection') {
      const result = await pms_base_dashboard_projection(
        { generatedAt: stringField(payload, 'generatedAt') },
        { bitableClient: deps.bitableClient, registry: deps.registry, now: deps.now }
      );
      return { statusCode: 200, body: { code: 0, ...result } };
    }

    if (operation === 'pms_base_update_operation_result') {
      const clientToken = stringField(payload, 'clientToken');
      const fields = recordField(payload, 'fields');
      if (!clientToken || !fields) {
        return invalidPayloadResponse([
          ...(!clientToken ? ['client_token_required'] : []),
          ...(!fields ? ['fields_required'] : [])
        ]);
      }
      const result = await pms_base_update_operation_result(
        { clientToken, fields },
        { bitableClient: deps.bitableClient, registry: deps.registry, now: deps.now }
      );
      return { statusCode: 200, body: { code: 0, ...result } };
    }

    if (operation === 'pms_base_upsert_operation_request') {
      const clientToken = stringField(payload, 'clientToken');
      const fields = recordField(payload, 'fields');
      if (!clientToken || !fields) {
        return invalidPayloadResponse([
          ...(!clientToken ? ['client_token_required'] : []),
          ...(!fields ? ['fields_required'] : [])
        ]);
      }
      const result = await pms_base_upsert_operation_request(
        { clientToken, fields },
        { bitableClient: deps.bitableClient, registry: deps.registry, now: deps.now }
      );
      return { statusCode: 200, body: { code: 0, ...result } };
    }

    if (operation === 'pms_base_update_room_projection') {
      const roomNumber = stringField(payload, 'roomNumber');
      const fields = recordField(payload, 'fields');
      if (!roomNumber || !fields) {
        return invalidPayloadResponse([
          ...(!roomNumber ? ['room_number_required'] : []),
          ...(!fields ? ['fields_required'] : [])
        ]);
      }
      const result = await pms_base_update_room_projection(
        { roomNumber, fields },
        { bitableClient: deps.bitableClient, registry: deps.registry, now: deps.now }
      );
      return { statusCode: 200, body: { code: 0, ...result } };
    }

    if (operation === 'pms_base_upsert_room_projection') {
      const roomNumber = stringField(payload, 'roomNumber');
      const fields = recordField(payload, 'fields');
      if (!roomNumber || !fields) {
        return invalidPayloadResponse([
          ...(!roomNumber ? ['room_number_required'] : []),
          ...(!fields ? ['fields_required'] : [])
        ]);
      }
      const result = await pms_base_upsert_room_projection(
        { roomNumber, fields },
        { bitableClient: deps.bitableClient, registry: deps.registry, now: deps.now }
      );
      return { statusCode: 200, body: { code: 0, ...result } };
    }

    if (operation === 'pms_base_append_operation_log') {
      const auditId = stringField(payload, 'auditId');
      const fields = recordField(payload, 'fields');
      if (!auditId || !fields) {
        return invalidPayloadResponse([
          ...(!auditId ? ['audit_id_required'] : []),
          ...(!fields ? ['fields_required'] : [])
        ]);
      }
      const result = await pms_base_append_operation_log(
        { auditId, fields, relationships: relationshipInputsField(payload) },
        { bitableClient: deps.bitableClient, registry: deps.registry, now: deps.now }
      );
      return { statusCode: 200, body: { code: 0, ...result } };
    }

    if (operation === 'pms_base_upsert_housekeeping_task_projection') {
      const taskId = stringField(payload, 'taskId');
      const fields = recordField(payload, 'fields');
      if (!taskId || !fields) {
        return invalidPayloadResponse([
          ...(!taskId ? ['task_id_required'] : []),
          ...(!fields ? ['fields_required'] : [])
        ]);
      }
      const result = await pms_base_upsert_housekeeping_task_projection(
        { taskId, fields, relationships: relationshipInputsField(payload) },
        { bitableClient: deps.bitableClient, registry: deps.registry, now: deps.now }
      );
      return { statusCode: 200, body: { code: 0, ...result } };
    }

    if (operation === 'pms_base_upsert_maintenance_ticket_projection') {
      const ticketId = stringField(payload, 'ticketId');
      const fields = recordField(payload, 'fields');
      if (!ticketId || !fields) {
        return invalidPayloadResponse([
          ...(!ticketId ? ['ticket_id_required'] : []),
          ...(!fields ? ['fields_required'] : [])
        ]);
      }
      const result = await pms_base_upsert_maintenance_ticket_projection(
        { ticketId, fields, relationships: relationshipInputsField(payload) },
        { bitableClient: deps.bitableClient, registry: deps.registry, now: deps.now }
      );
      return { statusCode: 200, body: { code: 0, ...result } };
    }

    if (operation === 'pms_base_get_reservation_projection') {
      const reservationCode = stringField(payload, 'reservationCode');
      if (!reservationCode) {
        return invalidPayloadResponse(['reservation_code_required']);
      }
      const result = await pms_base_get_reservation_projection(
        { reservationCode },
        { bitableClient: deps.bitableClient, registry: deps.registry, now: deps.now }
      );
      return { statusCode: 200, body: { code: 0, ...result } };
    }

    if (operation === 'pms_base_upsert_reservation_projection') {
      const reservationCode = stringField(payload, 'reservationCode');
      const fields = recordField(payload, 'fields');
      if (!reservationCode || !fields) {
        return invalidPayloadResponse([
          ...(!reservationCode ? ['reservation_code_required'] : []),
          ...(!fields ? ['fields_required'] : [])
        ]);
      }
      const result = await pms_base_upsert_reservation_projection(
        { reservationCode, fields, relationships: relationshipInputsField(payload) },
        { bitableClient: deps.bitableClient, registry: deps.registry, now: deps.now }
      );
      return { statusCode: 200, body: { code: 0, ...result } };
    }

    if (operation === 'pms_base_upsert_inventory_calendar_projection') {
      const intervalKey = stringField(payload, 'intervalKey');
      const fields = recordField(payload, 'fields');
      if (!intervalKey || !fields) {
        return invalidPayloadResponse([
          ...(!intervalKey ? ['interval_key_required'] : []),
          ...(!fields ? ['fields_required'] : [])
        ]);
      }
      const result = await pms_base_upsert_inventory_calendar_projection(
        { intervalKey, fields, relationships: relationshipInputsField(payload) },
        { bitableClient: deps.bitableClient, registry: deps.registry, now: deps.now }
      );
      return { statusCode: 200, body: { code: 0, ...result } };
    }

    if (operation === 'pms_base_prune_inventory_calendar_projection') {
      const intervalKey = stringField(payload, 'intervalKey');
      if (!intervalKey) {
        return invalidPayloadResponse(['interval_key_required']);
      }
      const result = await pms_base_prune_inventory_calendar_projection(
        { intervalKey, fields: recordField(payload, 'fields') },
        { bitableClient: deps.bitableClient, registry: deps.registry, now: deps.now }
      );
      return { statusCode: 200, body: { code: 0, ...result } };
    }

    if (operation === 'pms_base_upsert_projection_status') {
      const projectionKey = stringField(payload, 'projectionKey');
      const fields = recordField(payload, 'fields');
      if (!projectionKey || !fields) {
        return invalidPayloadResponse([
          ...(!projectionKey ? ['projection_key_required'] : []),
          ...(!fields ? ['fields_required'] : [])
        ]);
      }
      const result = await pms_base_upsert_projection_status(
        { projectionKey, fields },
        { bitableClient: deps.bitableClient, registry: deps.registry, now: deps.now }
      );
      return { statusCode: 200, body: { code: 0, ...result } };
    }

    if (operation === 'pms_base_prune_projection_status') {
      const projectionKey = stringField(payload, 'projectionKey');
      if (!projectionKey) {
        return invalidPayloadResponse(['projection_key_required']);
      }
      const result = await pms_base_prune_projection_status(
        { projectionKey, fields: recordField(payload, 'fields') },
        { bitableClient: deps.bitableClient, registry: deps.registry, now: deps.now }
      );
      return { statusCode: 200, body: { code: 0, ...result } };
    }

    if (operation === 'pms_base_today_arrivals_projection' || operation === 'pms_base_today_departures_projection') {
      const businessDate = stringField(payload, 'businessDate');
      if (!businessDate) {
        return invalidPayloadResponse(['business_date_required']);
      }
      const result = operation === 'pms_base_today_arrivals_projection'
        ? await pms_base_today_arrivals_projection(
            { businessDate },
            { bitableClient: deps.bitableClient, registry: deps.registry, now: deps.now }
          )
        : await pms_base_today_departures_projection(
            { businessDate },
            { bitableClient: deps.bitableClient, registry: deps.registry, now: deps.now }
          );
      return { statusCode: 200, body: { code: 0, ...result } };
    }

    return invalidPayloadResponse([`operation_not_allowed:${operation}`]);
  } catch (error) {
    return projectionErrorResponse(error);
  }
}

function projectionErrorResponse(error: unknown): PmsBaseProjectionResponse {
  if (error instanceof PmsBaseProjectionError) {
    return {
      statusCode: error.statusCode,
      body: {
        code: error.statusCode,
        message: error.code,
        error: error.message
      }
    };
  }

  return {
    statusCode: 502,
    body: {
      code: 502,
      message: 'pms_base_projection_failed',
      error: errorMessage(error)
    }
  };
}

function firstTargetShieldError(payload: JsonRecord): string | undefined {
  return firstTargetShieldErrorInRecord(payload);
}

function firstTargetShieldErrorInRecord(payload: Record<string, unknown>): string | undefined {
  for (const [key, value] of Object.entries(payload)) {
    if (['target', 'appToken', 'tableId', 'formId', 'recordId', 'callbackUrl', 'callbackURL', 'token', 'authToken', 'authorization', 'tenantId', 'tenant'].includes(key)) {
      return `target_not_allowed:${key}`;
    }
    if (isRecord(value)) {
      const nested = firstTargetShieldErrorInRecord(value);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
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

function parseJsonRecord(rawBody: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return isRecord(parsed) ? (parsed as JsonRecord) : null;
  } catch {
    return null;
  }
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

function isAuthorizedPmsBaseRequest(
  headers: IncomingHttpHeaders | undefined,
  expectedToken: string | undefined
): boolean {
  if (!expectedToken) {
    return true;
  }

  const authorization = headerValue(headers, 'authorization');
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length) === expectedToken;
  }

  return headerValue(headers, 'x-adapter-pms-base-token') === expectedToken;
}

function headerValue(headers: IncomingHttpHeaders | undefined, key: string): string | undefined {
  const value = headers?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown_error';
}
