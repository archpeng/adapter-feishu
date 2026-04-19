import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import type { FeishuEventEnvelope } from './types.js';
import type { WebhookServerConfig } from './webhook.js';

export async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function parseWebhookBody(rawBody: string): FeishuEventEnvelope | null {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return isRecord(parsed) ? (parsed as FeishuEventEnvelope) : null;
  } catch {
    return null;
  }
}

export function verifyWebhookToken(token: string | undefined, expected: string | undefined): boolean {
  if (!expected) {
    return true;
  }
  return token === expected;
}

export function verifyWebhookRequest(
  headers: IncomingHttpHeaders,
  rawBody: string,
  config: WebhookServerConfig
): boolean {
  if (!config.secret) {
    return true;
  }

  const timestamp = getHeader(headers, 'x-lark-request-timestamp');
  const nonce = getHeader(headers, 'x-lark-request-nonce');
  const signature = getHeader(headers, 'x-lark-signature');
  if (!timestamp || !nonce || !signature) {
    return false;
  }

  const digest = createHmac('sha256', config.secret).update(`${timestamp}:${nonce}:${rawBody}`).digest('hex');
  const actual = Buffer.from(signature);
  const expected = Buffer.from(digest);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function respondJson(res: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function getHeader(headers: IncomingHttpHeaders, key: string): string | undefined {
  const value = headers[key];
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
