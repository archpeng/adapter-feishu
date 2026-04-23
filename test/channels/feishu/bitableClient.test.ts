import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBitableClient } from '../../../src/channels/feishu/bitableClient.js';

describe('createBitableClient', () => {
  const createRecord = vi.fn();
  const getForm = vi.fn();
  const listFormFields = vi.fn();
  const createSdkClient = vi.fn();

  beforeEach(() => {
    createRecord.mockReset();
    getForm.mockReset();
    listFormFields.mockReset();
    createSdkClient.mockReset();
    createSdkClient.mockReturnValue({
      bitable: {
        appTableRecord: { create: createRecord },
        appTableForm: { get: getForm },
        appTableFormField: { list: listFormFields }
      }
    });
  });

  it('maps createRecord request into the SDK payload', async () => {
    createRecord.mockResolvedValue({
      code: 0,
      data: {
        record: {
          record_id: 'rec_1',
          fields: { Title: 'adapter-feishu' },
          created_time: 1712345678,
          last_modified_time: 1712345689
        }
      }
    });

    const client = createBitableClient(
      {
        appId: 'cli_test',
        appSecret: 'secret_test'
      },
      { createSdkClient }
    );

    const record = await client.createRecord({
      appToken: 'app_token_1',
      tableId: 'tbl_1',
      clientToken: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      userIdType: 'open_id',
      fields: {
        Title: 'adapter-feishu'
      }
    });

    expect(createSdkClient).toHaveBeenCalledWith({
      appId: 'cli_test',
      appSecret: 'secret_test'
    });
    expect(createRecord).toHaveBeenCalledWith({
      path: {
        app_token: 'app_token_1',
        table_id: 'tbl_1'
      },
      params: {
        user_id_type: 'open_id',
        client_token: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        ignore_consistency_check: undefined
      },
      data: {
        fields: {
          Title: 'adapter-feishu'
        }
      }
    });
    expect(record).toEqual({
      recordId: 'rec_1',
      fields: { Title: 'adapter-feishu' },
      createdTime: 1712345678,
      lastModifiedTime: 1712345689
    });
  });

  it('defaults createRecord user id type to user_id', async () => {
    createRecord.mockResolvedValue({
      code: 0,
      data: {
        record: {
          record_id: 'rec_2',
          fields: { Severity: 'warning' }
        }
      }
    });

    const client = createBitableClient(
      {
        appId: 'cli_test',
        appSecret: 'secret_test'
      },
      { createSdkClient }
    );

    await client.createRecord({
      appToken: 'app_token_1',
      tableId: 'tbl_1',
      fields: { Severity: 'warning' }
    });

    expect(createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          user_id_type: 'user_id'
        })
      })
    );
  });

  it('maps getForm and listFormFields into stable local shapes', async () => {
    getForm.mockResolvedValue({
      code: 0,
      data: {
        form: {
          name: 'Incident Intake',
          description: 'POC v1',
          shared: true,
          shared_url: 'https://feishu.test/forms/form_1',
          shared_limit: 'tenant_editable',
          submit_limit_once: false
        }
      }
    });
    listFormFields.mockResolvedValue({
      code: 0,
      data: {
        items: [
          {
            field_id: 'fld_1',
            title: 'Title',
            description: 'required field',
            required: true,
            visible: true
          }
        ],
        page_token: 'next_page',
        has_more: true,
        total: 5
      }
    });

    const client = createBitableClient(
      {
        appId: 'cli_test',
        appSecret: 'secret_test'
      },
      { createSdkClient }
    );

    const form = await client.getForm({
      appToken: 'app_token_1',
      tableId: 'tbl_1',
      formId: 'form_1'
    });
    const fields = await client.listFormFields({
      appToken: 'app_token_1',
      tableId: 'tbl_1',
      formId: 'form_1',
      pageSize: 100,
      pageToken: 'page_1'
    });

    expect(getForm).toHaveBeenCalledWith({
      path: {
        app_token: 'app_token_1',
        table_id: 'tbl_1',
        form_id: 'form_1'
      }
    });
    expect(listFormFields).toHaveBeenCalledWith({
      path: {
        app_token: 'app_token_1',
        table_id: 'tbl_1',
        form_id: 'form_1'
      },
      params: {
        page_size: 100,
        page_token: 'page_1'
      }
    });
    expect(form).toEqual({
      formId: 'form_1',
      name: 'Incident Intake',
      description: 'POC v1',
      shared: true,
      sharedUrl: 'https://feishu.test/forms/form_1',
      sharedLimit: 'tenant_editable',
      submitLimitOnce: false
    });
    expect(fields).toEqual({
      items: [
        {
          fieldId: 'fld_1',
          title: 'Title',
          description: 'required field',
          required: true,
          visible: true
        }
      ],
      hasMore: true,
      pageToken: 'next_page',
      total: 5
    });
  });

  it('throws a stable error when the SDK reports failure', async () => {
    createRecord.mockResolvedValue({
      code: 99991672,
      msg: 'permission denied'
    });

    const client = createBitableClient(
      {
        appId: 'cli_test',
        appSecret: 'secret_test'
      },
      { createSdkClient }
    );

    await expect(
      client.createRecord({
        appToken: 'app_token_1',
        tableId: 'tbl_1',
        fields: { Title: 'adapter-feishu' }
      })
    ).rejects.toThrow(/Failed to create Feishu Bitable record: permission denied/);
  });
});
