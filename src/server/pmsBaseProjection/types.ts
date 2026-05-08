import type { IncomingHttpHeaders } from 'node:http';
import type { BitableClient } from '../../channels/feishu/bitableClient.js';
import type { PmsBaseProjectionRegistry } from '../../projections/pmsBase.js';

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
