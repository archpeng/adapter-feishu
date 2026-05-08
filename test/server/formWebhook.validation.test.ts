import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createAlertDeduper } from '../../src/state/dedupe.js';
import { createTableWriteQueue } from '../../src/state/tableWriteQueue.js';
import { dispatchFormWebhookRequest } from '../../src/server/formWebhook.js';
import { parseManagedFormRegistry, type ManagedFormRegistry } from '../../src/forms/registry.js';
import { validClientToken, redactedTargetFields, expectNoRawTargetInResponse, createManagedFormRegistry, createPmsManagedFormRegistry, createSchemaClient } from './formWebhook.helpers.js';
describe('dispatchFormWebhookRequest', () => {
  it('writes the PMS operation request form through the managed Base record path', async () => {
    const createRecord = vi.fn().mockResolvedValue({ recordId: 'rec-operation-request-1' });
    const response = await dispatchFormWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/form-webhook',
        rawBody: JSON.stringify({
          formKey: 'pms-operation-request',
          clientToken: validClientToken,
          fields: {
            '操作类型': 'CHECK_OUT',
            '房号': '0308',
            '预订号': 'reservation-demo-1',
            '操作人': 'frontdesk-01',
            '原因': 'guest checked out',
            '备注': 'minibar checked',
            '请求时间': '2026-04-24T10:30:00+08:00'
          }
        })
      },
      {
        bitableClient: { createRecord },
        userIdType: 'user_id',
        formRegistry: createPmsManagedFormRegistry()
      }
    );

    expect(createRecord).toHaveBeenCalledWith(expect.objectContaining({
      appToken: 'example_pms_base_app_token',
      tableId: 'example_pms_operation_requests_table',
      clientToken: validClientToken,
      fields: expect.objectContaining({
        action: 'CHECK_OUT',
        roomNumber: '0308',
        reservationId: 'reservation-demo-1',
        operator: 'frontdesk-01',
        reason: 'guest checked out',
        notes: 'minibar checked',
        requestedAt: '2026-04-24T10:30:00+08:00',
        source: 'external_form',
        ingress: 'formKey:pms-operation-request',
        schemaVersion: 'pms-operation-request-intake-v1'
      })
    }));
    expect(response).toEqual(expect.objectContaining({
      statusCode: 200,
      body: expect.objectContaining({ status: 'record_created', targetSource: 'managed' })
    }));
  });

  it('serializes same-table writes so concurrent duplicate override requests only create one record', async () => {
    let resolveCreate = (_value: { recordId: string; fields: Record<string, unknown> }) => undefined;
    const createRecord = vi.fn().mockImplementation(
      () =>
        new Promise<{ recordId: string; fields: Record<string, unknown> }>((resolve) => {
          resolveCreate = resolve;
        })
    );
    const deduper = createAlertDeduper({ ttlMs: 1_000, now: () => 1_000 });
    const tableWriteQueue = createTableWriteQueue();
    const request = {
      method: 'POST',
      pathname: '/providers/form-webhook',
      rawBody: JSON.stringify({
        clientToken: validClientToken,
        fields: { Title: 'override path' },
        target: {
          appToken: 'app_token_override',
          tableId: 'tbl_override',
          formId: 'form_override'
        }
      })
    };
    const deps = {
      bitableClient: {
        createRecord
      },
      userIdType: 'open_id' as const,
      allowTargetOverride: true,
      deduper,
      tableWriteQueue,
      defaultTarget: {
        appToken: 'app_token_default',
        tableId: 'tbl_default'
      }
    };

    const firstPromise = dispatchFormWebhookRequest(request, deps);
    const secondPromise = dispatchFormWebhookRequest(request, deps);

    await Promise.resolve();

    expect(createRecord).toHaveBeenCalledTimes(1);
    expect(createRecord).toHaveBeenCalledWith({
      appToken: 'app_token_override',
      tableId: 'tbl_override',
      clientToken: validClientToken,
      userIdType: 'open_id',
      fields: { Title: 'override path' }
    });

    resolveCreate({
      recordId: 'rec_2',
      fields: { Title: 'override path' }
    });

    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(createRecord).toHaveBeenCalledTimes(1);
    expect(first).toEqual({
      statusCode: 200,
      body: {
        code: 0,
        status: 'record_created',
        recordId: 'rec_2',
        clientToken: validClientToken,
        ...redactedTargetFields('override', {
          appToken: 'app_token_override',
          tableId: 'tbl_override',
          formId: 'form_override'
        })
      }
    });
    expect(second).toEqual({
      statusCode: 202,
      body: {
        code: 0,
        status: 'duplicate_ignored',
        clientToken: validClientToken,
        ...redactedTargetFields('override', {
          appToken: 'app_token_override',
          tableId: 'tbl_override',
          formId: 'form_override'
        })
      }
    });
    expectNoRawTargetInResponse(first, ['app_token_override', 'tbl_override', 'form_override']);
    expectNoRawTargetInResponse(second, ['app_token_override', 'tbl_override', 'form_override']);
  });

  it('rejects explicit targets when override is disabled', async () => {
    const createRecord = vi.fn();

    const response = await dispatchFormWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/form-webhook',
        rawBody: JSON.stringify({
          clientToken: validClientToken,
          fields: { Title: 'adapter-feishu' },
          target: {
            appToken: 'app_token_override',
            tableId: 'tbl_override'
          }
        })
      },
      {
        bitableClient: {
          createRecord
        },
        userIdType: 'user_id',
        allowTargetOverride: false,
        defaultTarget: {
          appToken: 'app_token_default',
          tableId: 'tbl_default'
        }
      }
    );

    expect(createRecord).not.toHaveBeenCalled();
    expect(response).toEqual({
      statusCode: 400,
      body: {
        code: 400,
        message: 'invalid_payload',
        errors: ['target_override_not_allowed']
      }
    });
  });

  it('rejects missing required fields when schema validation is enabled', async () => {
    const createRecord = vi.fn();
    const getForm = vi.fn().mockResolvedValue({ formId: 'form_default' });
    const listFormFields = vi.fn().mockResolvedValue({
      items: [
        {
          fieldId: 'fld_title',
          title: 'Title',
          required: true,
          visible: true
        },
        {
          fieldId: 'fld_severity',
          title: 'Severity',
          required: true,
          visible: true
        }
      ],
      hasMore: false
    });
    const listTableFields = vi.fn().mockResolvedValue({
      items: [
        {
          fieldId: 'fld_title',
          fieldName: 'Title'
        },
        {
          fieldId: 'fld_severity',
          fieldName: 'Severity'
        }
      ],
      hasMore: false
    });

    const response = await dispatchFormWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/form-webhook',
        rawBody: JSON.stringify({
          clientToken: validClientToken,
          validateFormSchema: true,
          fields: { Title: 'adapter-feishu' }
        })
      },
      {
        bitableClient: {
          createRecord,
          getForm,
          listFormFields,
          listTableFields
        },
        userIdType: 'user_id',
        defaultTarget: {
          appToken: 'app_token_default',
          tableId: 'tbl_default',
          formId: 'form_default'
        }
      }
    );

    expect(getForm).toHaveBeenCalledWith({
      appToken: 'app_token_default',
      tableId: 'tbl_default',
      formId: 'form_default'
    });
    expect(listFormFields).toHaveBeenCalledWith({
      appToken: 'app_token_default',
      tableId: 'tbl_default',
      formId: 'form_default',
      pageSize: 500,
      pageToken: undefined
    });
    expect(listTableFields).toHaveBeenCalledWith({
      appToken: 'app_token_default',
      tableId: 'tbl_default',
      pageSize: 500,
      pageToken: undefined
    });
    expect(createRecord).not.toHaveBeenCalled();
    expect(response).toEqual({
      statusCode: 400,
      body: {
        code: 400,
        message: 'invalid_payload',
        errors: ['required_field_missing:Severity']
      }
    });
  });

  it('rejects hidden and unknown fields when schema validation is enabled', async () => {
    const createRecord = vi.fn();

    const response = await dispatchFormWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/form-webhook',
        rawBody: JSON.stringify({
          clientToken: validClientToken,
          validateFormSchema: true,
          fields: {
            Title: 'adapter-feishu',
            HiddenField: 'secret',
            UnknownField: 'oops'
          }
        })
      },
      {
        bitableClient: {
          createRecord,
          getForm: vi.fn().mockResolvedValue({ formId: 'form_default' }),
          listFormFields: vi.fn().mockResolvedValue({
            items: [
              {
                fieldId: 'fld_title',
                title: 'Title',
                required: true,
                visible: true
              },
              {
                fieldId: 'fld_hidden',
                title: 'HiddenField',
                required: false,
                visible: false
              }
            ],
            hasMore: false
          }),
          listTableFields: vi.fn().mockResolvedValue({
            items: [
              {
                fieldId: 'fld_title',
                fieldName: 'Title'
              },
              {
                fieldId: 'fld_hidden',
                fieldName: 'HiddenField'
              }
            ],
            hasMore: false
          })
        },
        userIdType: 'user_id',
        defaultTarget: {
          appToken: 'app_token_default',
          tableId: 'tbl_default',
          formId: 'form_default'
        }
      }
    );

    expect(createRecord).not.toHaveBeenCalled();
    expect(response).toEqual({
      statusCode: 400,
      body: {
        code: 400,
        message: 'invalid_payload',
        errors: ['field_not_visible:HiddenField', 'field_not_in_form:UnknownField']
      }
    });
  });

  it('accepts table field names when form titles drift and normalizes form-title aliases before record creation', async () => {
    const createRecord = vi.fn().mockResolvedValue({
      recordId: 'rec_form_alias',
      fields: { CanonicalField: 'adapter-feishu' }
    });

    const response = await dispatchFormWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/form-webhook',
        rawBody: JSON.stringify({
          clientToken: validClientToken,
          validateFormSchema: true,
          fields: {
            DisplayLabel: 'adapter-feishu'
          }
        })
      },
      {
        bitableClient: {
          createRecord,
          getForm: vi.fn().mockResolvedValue({ formId: 'form_default' }),
          listFormFields: vi.fn().mockResolvedValue({
            items: [
              {
                fieldId: 'fld_alias',
                title: 'DisplayLabel',
                required: true,
                visible: true
              }
            ],
            hasMore: false
          }),
          listTableFields: vi.fn().mockResolvedValue({
            items: [
              {
                fieldId: 'fld_alias',
                fieldName: 'CanonicalField'
              }
            ],
            hasMore: false
          })
        },
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
      fields: {
        CanonicalField: 'adapter-feishu'
      }
    });
    expect(response).toEqual({
      statusCode: 200,
      body: {
        code: 0,
        status: 'record_created',
        recordId: 'rec_form_alias',
        clientToken: validClientToken,
        schemaValidated: true,
        ...redactedTargetFields('default', {
          appToken: 'app_token_default',
          tableId: 'tbl_default',
          formId: 'form_default'
        })
      }
    });
    expectNoRawTargetInResponse(response, ['app_token_default', 'tbl_default', 'form_default']);
  });

  it('honestly rejects schema validation when no formId is available', async () => {
    const getForm = vi.fn();
    const listFormFields = vi.fn();
    const createRecord = vi.fn();

    const response = await dispatchFormWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/form-webhook',
        rawBody: JSON.stringify({
          clientToken: validClientToken,
          validateFormSchema: true,
          fields: { Title: 'adapter-feishu' }
        })
      },
      {
        bitableClient: {
          createRecord,
          getForm,
          listFormFields
        },
        userIdType: 'user_id',
        defaultTarget: {
          appToken: 'app_token_default',
          tableId: 'tbl_default'
        }
      }
    );

    expect(getForm).not.toHaveBeenCalled();
    expect(listFormFields).not.toHaveBeenCalled();
    expect(createRecord).not.toHaveBeenCalled();
    expect(response).toEqual({
      statusCode: 400,
      body: {
        code: 400,
        message: 'invalid_payload',
        errors: ['form_id_required_for_schema_validation']
      }
    });
  });

  it('returns 502 when schema preflight fails upstream', async () => {
    const createRecord = vi.fn();
    const getForm = vi.fn().mockRejectedValue(new Error('permission denied'));
    const listFormFields = vi.fn();
    const listTableFields = vi.fn();

    const response = await dispatchFormWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/form-webhook',
        rawBody: JSON.stringify({
          clientToken: validClientToken,
          validateFormSchema: true,
          fields: { Title: 'adapter-feishu' }
        })
      },
      {
        bitableClient: {
          createRecord,
          getForm,
          listFormFields,
          listTableFields
        },
        userIdType: 'user_id',
        defaultTarget: {
          appToken: 'app_token_default',
          tableId: 'tbl_default',
          formId: 'form_default'
        }
      }
    );

    expect(createRecord).not.toHaveBeenCalled();
    expect(listFormFields).not.toHaveBeenCalled();
    expect(listTableFields).not.toHaveBeenCalled();
    expect(response).toEqual({
      statusCode: 502,
      body: {
        code: 502,
        message: 'schema_validation_failed',
        error: 'permission denied'
      }
    });
  });

  it('returns 502 when downstream record creation fails', async () => {
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
          createRecord: vi.fn().mockRejectedValue(new Error('permission denied'))
        },
        userIdType: 'user_id',
        defaultTarget: {
          appToken: 'app_token_default',
          tableId: 'tbl_default'
        }
      }
    );

    expect(response).toEqual({
      statusCode: 502,
      body: {
        code: 502,
        message: 'record_create_failed',
        error: 'permission denied'
      }
    });
  });
});
