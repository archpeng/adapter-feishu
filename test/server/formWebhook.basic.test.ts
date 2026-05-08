import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createAlertDeduper } from '../../src/state/dedupe.js';
import { createTableWriteQueue } from '../../src/state/tableWriteQueue.js';
import { dispatchFormWebhookRequest } from '../../src/server/formWebhook.js';
import { parseManagedFormRegistry, type ManagedFormRegistry } from '../../src/forms/registry.js';
import { validClientToken, redactedTargetFields, expectNoRawTargetInResponse, createManagedFormRegistry, createPmsManagedFormRegistry, createSchemaClient } from './formWebhook.helpers.js';
describe('dispatchFormWebhookRequest', () => {
  it('rejects form pushes without the configured auth token', async () => {
    const response = await dispatchFormWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/form-webhook',
        rawBody: JSON.stringify({
          clientToken: validClientToken,
          fields: { Title: 'adapter-feishu' }
        })
      },
      {
        bitableClient: {
          createRecord: vi.fn()
        },
        authToken: 'form-token-1',
        userIdType: 'user_id',
        defaultTarget: {
          appToken: 'app_token_default',
          tableId: 'tbl_default'
        }
      }
    );

    expect(response).toEqual({
      statusCode: 401,
      body: {
        code: 401,
        message: 'unauthorized'
      }
    });
  });

  it('rejects invalid json bodies', async () => {
    const response = await dispatchFormWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/form-webhook',
        rawBody: '{'
      },
      {
        bitableClient: {
          createRecord: vi.fn()
        },
        userIdType: 'user_id',
        defaultTarget: {
          appToken: 'app_token_default',
          tableId: 'tbl_default'
        }
      }
    );

    expect(response).toEqual({
      statusCode: 400,
      body: {
        code: 400,
        message: 'invalid_json'
      }
    });
  });

  it('rejects invalid payloads when clientToken is not uuidv4', async () => {
    const response = await dispatchFormWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/form-webhook',
        rawBody: JSON.stringify({
          clientToken: 'business-order-1',
          fields: { Title: 'adapter-feishu' }
        })
      },
      {
        bitableClient: {
          createRecord: vi.fn()
        },
        userIdType: 'user_id',
        defaultTarget: {
          appToken: 'app_token_default',
          tableId: 'tbl_default'
        }
      }
    );

    expect(response).toEqual({
      statusCode: 400,
      body: {
        code: 400,
        message: 'invalid_payload',
        errors: ['client_token_invalid']
      }
    });
  });

  it('writes a record against the configured default target and returns a stable success shape', async () => {
    const createRecord = vi.fn().mockResolvedValue({
      recordId: 'rec_1',
      fields: { Title: 'adapter-feishu' }
    });

    const response = await dispatchFormWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/form-webhook',
        headers: {
          authorization: 'Bearer form-token-1'
        },
        rawBody: JSON.stringify({
          clientToken: validClientToken,
          fields: { Title: 'adapter-feishu' }
        })
      },
      {
        bitableClient: {
          createRecord
        },
        authToken: 'form-token-1',
        userIdType: 'user_id',
        defaultTarget: {
          appToken: 'app_token_default',
          tableId: 'tbl_default',
          formId: 'form_default'
        }
      }
    );

    expect(createRecord).toHaveBeenCalledWith({
      appToken: 'app_token_default',
      tableId: 'tbl_default',
      clientToken: validClientToken,
      userIdType: 'user_id',
      fields: { Title: 'adapter-feishu' }
    });
    expect(response).toEqual({
      statusCode: 200,
      body: {
        code: 0,
        status: 'record_created',
        recordId: 'rec_1',
        clientToken: validClientToken,
        ...redactedTargetFields('default', {
          appToken: 'app_token_default',
          tableId: 'tbl_default',
          formId: 'form_default'
        })
      }
    });
    expectNoRawTargetInResponse(response, ['app_token_default', 'tbl_default', 'form_default']);
  });


});
