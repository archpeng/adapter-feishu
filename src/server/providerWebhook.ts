import type { IncomingHttpHeaders } from 'node:http';
import type { JsonRecord } from '../core/contracts.js';
import type { ProviderCallbackForwarder, ProviderNotificationSink } from '../providers/contracts.js';
import type { ProviderRouteResolution, ProviderRouter } from '../providers/router.js';
import type { AlertDeduper } from '../state/dedupe.js';
import type { PendingStore } from '../state/pendingStore.js';

export interface ProviderWebhookRequest {
  method?: string;
  pathname?: string;
  headers?: IncomingHttpHeaders;
  rawBody: string;
}

export interface ProviderWebhookResponse {
  statusCode: number;
  body: Record<string, unknown>;
}

export interface ProviderWebhookDispatchDeps {
  providerRouter: ProviderRouter;
  replySink: ProviderNotificationSink;
  defaultTarget?: import('../core/contracts.js').DeliveryTarget;
  authToken?: string;
  deduper?: AlertDeduper;
  pendingStore?: PendingStore;
  callbackForwarder?: ProviderCallbackForwarder;
  dedupeKeyFromPayload?: (
    payload: JsonRecord,
    resolution: ProviderRouteResolution
  ) => string | undefined;
  now?: () => string;
}

export async function dispatchProviderWebhookRequest(
  request: ProviderWebhookRequest,
  deps: ProviderWebhookDispatchDeps
): Promise<ProviderWebhookResponse> {
  const pathname = request.pathname ?? '/providers/webhook';
  if (pathname !== '/provider-webhook' && pathname !== '/providers/webhook') {
    return { statusCode: 404, body: { code: 404, message: 'not_found' } };
  }

  if (request.method !== 'POST') {
    return { statusCode: 405, body: { code: 405, message: 'method_not_allowed' } };
  }

  if (!isAuthorizedProviderRequest(request.headers, deps.authToken)) {
    return { statusCode: 401, body: { code: 401, message: 'unauthorized' } };
  }

  const payload = parseJsonRecord(request.rawBody);
  if (!payload) {
    return { statusCode: 400, body: { code: 400, message: 'invalid_json' } };
  }

  const resolution = deps.providerRouter.resolve(payload);
  const provider = resolution.provider.definition;
  if (!provider.supportsNotification(payload)) {
    return { statusCode: 400, body: { code: 400, message: 'unsupported_payload' } };
  }

  const dedupeKey = deps.dedupeKeyFromPayload?.(payload, resolution);
  if (deps.deduper && dedupeKey) {
    const decision = deps.deduper.markSeen({
      providerKey: resolution.providerKey,
      dedupeKey
    });

    if (decision.isDuplicate) {
      return {
        statusCode: 202,
        body: {
          code: 0,
          providerKey: resolution.providerKey,
          status: 'duplicate_ignored'
        }
      };
    }
  }

  const result = await provider.deliverNotification(payload, {
    replySink: deps.replySink,
    defaultTarget: deps.defaultTarget,
    now: deps.now,
    pendingStore: deps.pendingStore,
    callbackForwarder: deps.callbackForwarder
  }).catch((error: unknown) => {
    return {
      error
    };
  });

  if ('error' in result) {
    return {
      statusCode: 502,
      body: {
        code: 502,
        providerKey: resolution.providerKey,
        message: 'provider_delivery_failed',
        error: errorMessage(result.error)
      }
    };
  }

  return {
    statusCode: 202,
    body: {
      code: 0,
      providerKey: resolution.providerKey,
      status: result.status
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAuthorizedProviderRequest(
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

  return headerValue(headers, 'x-adapter-provider-token') === expectedToken;
}

function headerValue(headers: IncomingHttpHeaders | undefined, key: string): string | undefined {
  const value = headers?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown_error';
}
