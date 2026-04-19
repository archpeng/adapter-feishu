import type { JsonRecord } from '../../core/contracts.js';
import {
  isWarningAgentNotificationPayload,
  type WarningAgentNotificationPayload
} from './contracts.js';

type FetchLike = typeof fetch;

export interface WarningAgentClientConfig {
  baseUrl: string;
  fetchImpl?: FetchLike;
  headers?: Record<string, string>;
}

export interface WarningAgentClient {
  fetchReport(reportId: string): Promise<WarningAgentNotificationPayload>;
}

export function createWarningAgentClient(config: WarningAgentClientConfig): WarningAgentClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const baseUrl = config.baseUrl.replace(/\/$/, '');

  return {
    async fetchReport(reportId) {
      const response = await fetchImpl(`${baseUrl}/reports/${encodeURIComponent(reportId)}`, {
        headers: config.headers ?? {}
      });
      const payload = await parseJsonObject(response);

      if (!response.ok || !isWarningAgentNotificationPayload(payload)) {
        throw new Error(`Failed to fetch warning-agent report payload: ${response.status}`);
      }

      return payload;
    }
  };
}

async function parseJsonObject(response: Response): Promise<JsonRecord> {
  const payload = (await response.json()) as unknown;
  return isRecord(payload) ? (payload as JsonRecord) : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
