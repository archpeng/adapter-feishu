import type { InboundTurn, JsonRecord } from '../core/contracts.js';

export const AI_CONVERSATION_AUTH_HEADER = 'X-AI-CONVERSATION-TOKEN';
export const AI_CONVERSATION_AUTH_ENV_NAME = 'AI_CONVERSATION_INBOUND_AUTH_TOKEN';

export interface ConversationTurnForwarderOptions {
  url: string;
  token: string;
  headerName?: typeof AI_CONVERSATION_AUTH_HEADER;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface ConversationTurnForwardResult {
  statusCode: number;
  body: JsonRecord;
}

export interface ConversationTurnForwarder {
  forwardTurn(turn: InboundTurn): Promise<ConversationTurnForwardResult>;
}

export function createConversationHttpTurnForwarder(
  options: ConversationTurnForwarderOptions
): ConversationTurnForwarder {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headerName = options.headerName ?? AI_CONVERSATION_AUTH_HEADER;
  const timeoutMs = options.timeoutMs ?? 5_000;

  return {
    async forwardTurn(turn) {
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), timeoutMs);
      try {
        const response = await fetchImpl(options.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [headerName]: options.token
          },
          body: JSON.stringify({
            source: 'adapter-feishu',
            turn
          }),
          signal: abortController.signal
        });
        const body = await parseResponseBody(response);
        if (!response.ok) {
          throw new Error(`conversation_turn_forward_failed:${response.status}`);
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
