import type { DeliveryTarget } from '../../core/contracts.js';
import { resolveFeishuMessageTarget, type FeishuClientSendResult } from './types.js';

type FetchLike = typeof fetch;

type FeishuTokenCache = {
  token: string;
  expiresAt: number;
};

export interface FeishuClientConfig {
  appId: string;
  appSecret: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export interface FeishuClient {
  sendText(target: DeliveryTarget, text: string): Promise<FeishuClientSendResult>;
  sendCard(target: DeliveryTarget, card: Record<string, unknown>): Promise<FeishuClientSendResult>;
}

export function createFeishuClient(config: FeishuClientConfig): FeishuClient {
  const baseUrl = config.baseUrl ?? 'https://open.feishu.cn';
  const fetchImpl = config.fetchImpl ?? fetch;
  let tokenCache: FeishuTokenCache | null = null;

  async function getAccessToken(): Promise<string> {
    if (tokenCache && tokenCache.expiresAt > Date.now()) {
      return tokenCache.token;
    }

    const response = await fetchImpl(`${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        app_id: config.appId,
        app_secret: config.appSecret
      })
    });
    const payload = await parseJsonObject(response);

    if (!response.ok || payload.code !== 0 || typeof payload.tenant_access_token !== 'string') {
      throw new Error(
        `Failed to acquire Feishu tenant access token: ${stringValue(payload.msg) ?? response.statusText}`
      );
    }

    const ttlSeconds = Math.max(numberValue(payload.expire) ?? 7200, 60) - 60;
    tokenCache = {
      token: payload.tenant_access_token,
      expiresAt: Date.now() + Math.max(ttlSeconds, 60) * 1000
    };
    return tokenCache.token;
  }

  async function sendMessage(
    target: DeliveryTarget,
    msgType: 'text' | 'interactive',
    content: string
  ): Promise<FeishuClientSendResult> {
    const accessToken = await getAccessToken();
    const resolvedTarget = resolveFeishuMessageTarget(target);
    const response = await fetchImpl(
      `${baseUrl}/open-apis/im/v1/messages?receive_id_type=${resolvedTarget.receiveIdType}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          receive_id: resolvedTarget.receiveId,
          msg_type: msgType,
          content,
          ...(resolvedTarget.threadId ? { uuid: resolvedTarget.threadId } : {})
        })
      }
    );
    const payload = await parseJsonObject(response);

    if (!response.ok || payload.code !== 0) {
      throw new Error(`Failed to send Feishu message: ${stringValue(payload.msg) ?? response.statusText}`);
    }

    return {
      messageId: isRecord(payload.data) ? stringValue(payload.data.message_id) : undefined
    };
  }

  return {
    async sendText(target, text) {
      return sendMessage(target, 'text', JSON.stringify({ text }));
    },
    async sendCard(target, card) {
      return sendMessage(target, 'interactive', JSON.stringify(card));
    }
  };
}

async function parseJsonObject(response: Response): Promise<Record<string, unknown>> {
  const payload = (await response.json()) as unknown;
  return isRecord(payload) ? payload : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
