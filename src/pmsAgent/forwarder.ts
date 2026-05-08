import type { JsonRecord } from '../core/contracts.js';
import { inboundTurnToFeishuTurnInput } from './turn.js';
import {
  PMS_AGENT_AUTH_HEADER,
  type AgentResult,
  type FeishuTurnInput
} from './contracts.js';
import type { InboundTurn } from '../core/contracts.js';

export interface PmsAgentTurnForwarderOptions {
  url: string;
  token: string;
  headerName?: typeof PMS_AGENT_AUTH_HEADER;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface PmsAgentTurnForwardResult {
  statusCode: number;
  body: JsonRecord;
  result?: AgentResult;
}

export interface PmsAgentTurnForwarder {
  forwardTurn(turn: InboundTurn): Promise<PmsAgentTurnForwardResult>;
}

export function createPmsAgentHttpTurnForwarder(options: PmsAgentTurnForwarderOptions): PmsAgentTurnForwarder {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headerName = options.headerName ?? PMS_AGENT_AUTH_HEADER;
  const timeoutMs = options.timeoutMs ?? 5_000;

  return {
    async forwardTurn(turn) {
      const input = inboundTurnToFeishuTurnInput(turn);
      if (!input) {
        throw new Error('pms_agent_turn_unmappable');
      }

      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), timeoutMs);
      try {
        const response = await fetchImpl(options.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [headerName]: options.token
          },
          body: JSON.stringify(input satisfies FeishuTurnInput),
          signal: abortController.signal
        });
        const body = await parseResponseBody(response);
        const result = parseAgentResultFromBody(body);
        if (!response.ok && !result) {
          throw new Error(`pms_agent_turn_forward_failed:${response.status}`);
        }
        return {
          statusCode: response.status,
          body,
          result
        };
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

function parseAgentResultFromBody(body: JsonRecord): AgentResult | undefined {
  // Keep the validated transport-boundary cast here so downstream delivery code receives a typed AgentResult.
  return isAgentResult(body) ? body as unknown as AgentResult : undefined;
}

function isAgentResult(value: JsonRecord): boolean {
  switch (value.type) {
    case 'text':
      return nonEmptyString(value.text);
    case 'refusal':
      return (value.reason === 'policy' || value.reason === 'unsupported' || value.reason === 'invalid_request')
        && nonEmptyString(value.message);
    case 'proposal':
      return nonEmptyString(value.proposalId)
        && nonEmptyString(value.title)
        && nonEmptyString(value.summary)
        && value.approvalRequired === true;
    case 'approval_card':
      return isApprovalCard(value.card);
    default:
      return false;
  }
}

function isApprovalCard(value: unknown): boolean {
  if (!isRecord(value) || value.type !== 'pms_pending_action_card') return false;
  const ref = value.ref;
  return isRecord(ref)
    && ref.type === 'pms_pending_action'
    && nonEmptyString(ref.pendingActionRef ?? ref.pendingActionId)
    && nonEmptyString(ref.cardPayloadRef)
    && ref.action === 'reservation_confirm'
    && nonEmptyString(value.title)
    && nonEmptyString(value.summary)
    && nonEmptyString(value.confirmLabel)
    && nonEmptyString(value.cancelLabel);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

async function parseResponseBody(response: Response): Promise<JsonRecord> {
  const text = await response.text();
  if (!text.trim()) return {};
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
