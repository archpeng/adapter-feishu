import type { IncomingHttpHeaders } from 'node:http';
import type { BitableClient } from '../channels/feishu/bitableClient.js';
import type { JsonRecord } from '../core/contracts.js';
import {
  PmsBaseProjectionError,
  type PmsBaseProjectionRegistry
} from '../projections/pmsBase.js';
import { dispatchPmsBaseProjectionOperation } from './pmsBaseProjection/handlers.js';

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
    return await dispatchPmsBaseProjectionOperation(operation, payload, {
      bitableClient: deps.bitableClient,
      registry: deps.registry,
      now: deps.now
    });
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
