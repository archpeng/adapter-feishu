import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBitableClient } from '../../../src/channels/feishu/bitableClient.js';

describe('createBitableClient', () => {
  const createRecord = vi.fn();
  const getRecord = vi.fn();
  const listRecords = vi.fn();
  const updateRecord = vi.fn();
  const getForm = vi.fn();
  const listTableFields = vi.fn();
  const listFormFields = vi.fn();
  const createSdkClient = vi.fn();

  beforeEach(() => {
    createRecord.mockReset();
    getRecord.mockReset();
    listRecords.mockReset();
    updateRecord.mockReset();
    getForm.mockReset();
    listTableFields.mockReset();
    listFormFields.mockReset();
    createSdkClient.mockReset();
    createSdkClient.mockReturnValue({
      bitable: {
        appTableRecord: {
          create: createRecord,
          get: getRecord,
          list: listRecords,
          update: updateRecord
        },
        appTableForm: { get: getForm },
        appTableField: { list: listTableFields },
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

  it('maps getRecord, listRecords, and updateRecord into stable local shapes', async () => {
    getRecord.mockResolvedValue({
      code: 0,
      data: {
        record: {
          record_id: 'rec_room_1',
          fields: { RoomNumber: '101' },
          created_time: 1712345678,
          last_modified_time: 1712345689
        }
      }
    });
    listRecords.mockResolvedValue({
      code: 0,
      data: {
        items: [
          {
            record_id: 'rec_room_1',
            fields: { RoomNumber: '101' }
          }
        ],
        page_token: 'next_record_page',
        has_more: true,
        total: 2
      }
    });
    updateRecord.mockResolvedValue({
      code: 0,
      data: {
        record: {
          record_id: 'rec_room_1',
          fields: { RoomNumber: '101', OccupancyStatus: 'InHouse' }
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

    const record = await client.getRecord({
      appToken: 'app_token_1',
      tableId: 'tbl_1',
      recordId: 'rec_room_1',
      userIdType: 'open_id'
    });
    const recordPage = await client.listRecords({
      appToken: 'app_token_1',
      tableId: 'tbl_1',
      pageSize: 100,
      pageToken: 'page_1'
    });
    const updatedRecord = await client.updateRecord({
      appToken: 'app_token_1',
      tableId: 'tbl_1',
      recordId: 'rec_room_1',
      fields: { OccupancyStatus: 'InHouse' },
      userIdType: 'union_id'
    });

    expect(getRecord).toHaveBeenCalledWith({
      path: {
        app_token: 'app_token_1',
        table_id: 'tbl_1',
        record_id: 'rec_room_1'
      },
      params: {
        user_id_type: 'open_id'
      }
    });
    expect(listRecords).toHaveBeenCalledWith({
      path: {
        app_token: 'app_token_1',
        table_id: 'tbl_1'
      },
      params: {
        page_size: 100,
        page_token: 'page_1',
        user_id_type: 'user_id'
      }
    });
    expect(updateRecord).toHaveBeenCalledWith({
      path: {
        app_token: 'app_token_1',
        table_id: 'tbl_1',
        record_id: 'rec_room_1'
      },
      params: {
        user_id_type: 'union_id',
        ignore_consistency_check: undefined
      },
      data: {
        fields: { OccupancyStatus: 'InHouse' }
      }
    });
    expect(record).toEqual({
      recordId: 'rec_room_1',
      fields: { RoomNumber: '101' },
      createdTime: 1712345678,
      lastModifiedTime: 1712345689
    });
    expect(recordPage).toEqual({
      items: [
        {
          recordId: 'rec_room_1',
          fields: { RoomNumber: '101' },
          createdTime: undefined,
          lastModifiedTime: undefined
        }
      ],
      hasMore: true,
      pageToken: 'next_record_page',
      total: 2
    });
    expect(updatedRecord).toEqual({
      recordId: 'rec_room_1',
      fields: { RoomNumber: '101', OccupancyStatus: 'InHouse' },
      createdTime: undefined,
      lastModifiedTime: undefined
    });
  });

  it('maps getForm, listFormFields, and listTableFields into stable local shapes', async () => {
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
        page_token: 'next_form_page',
        has_more: true,
        total: 5
      }
    });
    listTableFields.mockResolvedValue({
      code: 0,
      data: {
        items: [
          {
            field_id: 'fld_1',
            field_name: 'CanonicalTitle',
            type: 1,
            ui_type: 'Text'
          }
        ],
        page_token: 'next_table_page',
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
    const formFields = await client.listFormFields({
      appToken: 'app_token_1',
      tableId: 'tbl_1',
      formId: 'form_1',
      pageSize: 100,
      pageToken: 'page_1'
    });
    const tableFields = await client.listTableFields({
      appToken: 'app_token_1',
      tableId: 'tbl_1',
      pageSize: 100,
      pageToken: 'page_2'
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
    expect(listTableFields).toHaveBeenCalledWith({
      path: {
        app_token: 'app_token_1',
        table_id: 'tbl_1'
      },
      params: {
        page_size: 100,
        page_token: 'page_2'
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
    expect(formFields).toEqual({
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
      pageToken: 'next_form_page',
      total: 5
    });
    expect(tableFields).toEqual({
      items: [
        {
          fieldId: 'fld_1',
          fieldName: 'CanonicalTitle',
          type: 1,
          uiType: 'Text'
        }
      ],
      hasMore: true,
      pageToken: 'next_table_page',
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
