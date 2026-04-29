import type { JsonRecord } from '../core/contracts.js';

export const AI_PMS_OPERATION_REQUEST_INTAKE_AUTH_HEADER = 'X-AI-PMS-CALLBACK-TOKEN';
export const AI_PMS_OPERATION_REQUEST_INTAKE_AUTH_ENV_NAME = 'AI_PMS_CALLBACK_TOKEN';

export interface OperationRequestIntakeForwarderOptions {
  url: string;
  token: string;
  headerName?: typeof AI_PMS_OPERATION_REQUEST_INTAKE_AUTH_HEADER;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface OperationRequestIntakeForwardResult {
  statusCode: number;
  body: JsonRecord;
}

export interface OperationRequestIntakeForwarder {
  forwardOperationRequest(payload: JsonRecord): Promise<OperationRequestIntakeForwardResult>;
}

export function createOperationRequestIntakeForwarder(
  options: OperationRequestIntakeForwarderOptions
): OperationRequestIntakeForwarder {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headerName = options.headerName ?? AI_PMS_OPERATION_REQUEST_INTAKE_AUTH_HEADER;
  const timeoutMs = options.timeoutMs ?? 5_000;

  return {
    async forwardOperationRequest(payload) {
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), timeoutMs);
      try {
        const response = await fetchImpl(options.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [headerName]: options.token
          },
          body: JSON.stringify(payload),
          signal: abortController.signal
        });
        const body = await parseResponseBody(response);
        if (!response.ok) {
          throw new Error(`operation_request_intake_forward_failed:${response.status}`);
        }
        return {
          statusCode: response.status,
          body
        };
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

async function parseResponseBody(response: Response): Promise<JsonRecord> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : { raw: text };
  } catch {
    return { raw: text };
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
