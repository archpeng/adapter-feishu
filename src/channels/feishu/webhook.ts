import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  parseWebhookBody,
  readRequestBody,
  respondJson,
  verifyWebhookRequest,
  verifyWebhookToken
} from './webhookSecurity.js';
import { normalizeFeishuMessageEvent, type FeishuTurnHandler } from './types.js';

export interface WebhookServerConfig {
  host: string;
  port: number;
  verificationToken?: string;
  secret?: string;
}

export interface WebhookServer {
  server: Server;
  listen(): Promise<void>;
  close(): Promise<void>;
}

export interface DispatchRequest {
  method?: string;
  headers: IncomingHttpHeaders;
  rawBody: string;
  pathname?: string;
}

export interface DispatchResponse {
  statusCode: number;
  body: Record<string, unknown>;
}

export function createWebhookServer(config: WebhookServerConfig, handleTurn: FeishuTurnHandler): WebhookServer {
  const server = createServer(async (req, res) => {
    await handleWebhookRequest(req, res, config, handleTurn);
  });

  return {
    server,
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, () => {
          server.off('error', reject);
          resolve();
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}

async function handleWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: WebhookServerConfig,
  handleTurn: FeishuTurnHandler
): Promise<void> {
  const rawBody = await readRequestBody(req);
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const response = await dispatchWebhookRequest(
    {
      method: req.method,
      headers: req.headers,
      rawBody,
      pathname: url.pathname
    },
    config,
    handleTurn
  );
  respondJson(res, response.statusCode, response.body);
}

export async function dispatchWebhookRequest(
  request: DispatchRequest,
  config: WebhookServerConfig,
  handleTurn: FeishuTurnHandler
): Promise<DispatchResponse> {
  const pathname = request.pathname ?? '/';
  if (pathname !== '/' && pathname !== '/webhook') {
    return { statusCode: 404, body: { code: 404, message: 'not_found' } };
  }

  if (request.method !== 'POST') {
    return { statusCode: 405, body: { code: 405, message: 'method_not_allowed' } };
  }

  if (!verifyWebhookRequest(request.headers, request.rawBody, config)) {
    return { statusCode: 401, body: { code: 401, message: 'unauthorized' } };
  }

  const parsedBody = parseWebhookBody(request.rawBody);
  if (!parsedBody) {
    return { statusCode: 400, body: { code: 400, message: 'invalid_json' } };
  }

  if (!verifyWebhookToken(parsedBody.token, config.verificationToken)) {
    return { statusCode: 401, body: { code: 401, message: 'invalid_token' } };
  }

  if (parsedBody.type === 'url_verification' && parsedBody.challenge) {
    return { statusCode: 200, body: { challenge: parsedBody.challenge } };
  }

  const turn = normalizeFeishuMessageEvent(parsedBody);
  if (!turn) {
    return { statusCode: 200, body: { code: 0, message: 'ignored' } };
  }

  await handleTurn(turn, {
    source: 'webhook',
    rawEvent: parsedBody
  });

  return { statusCode: 200, body: { code: 0 } };
}
