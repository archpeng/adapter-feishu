import { describe, expect, it, vi } from 'vitest';
import { createAlertDeduper } from '../../src/state/dedupe.js';
import { createTableWriteQueue } from '../../src/state/tableWriteQueue.js';
import { dispatchFormWebhookRequest } from '../../src/server/formWebhook.js';
import type { ManagedFormRegistry } from '../../src/forms/registry.js';

const validClientToken = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

function createManagedFormRegistry(overrides: Partial<ManagedFormRegistry['forms'][string]> = {}): ManagedFormRegistry {
  return {
    version: 1,
    forms: {
      'pms-intake': {
        formKey: 'pms-intake',
        enabled: true,
        target: {
          appToken: 'app_token_managed',
          tableId: 'tbl_managed',
          formId: 'form_managed'
        },
        fieldMap: {
          title: 'Title',
          severity: 'Severity'
        },
        fixedFields: {
          Source: 'managed-form'
        },
        policy: {
          validateFormSchemaByDefault: false,
          rejectUnmappedFields: true
        },
        ...overrides
      }
    }
  };
}

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
        targetSource: 'default',
        target: {
          appToken: 'app_token_default',
          tableId: 'tbl_default',
          formId: 'form_default'
        }
      }
    });
  });

  it('writes managed formKey requests through registry target, fieldMap, and fixedFields without caller target', async () => {
    const createRecord = vi.fn().mockResolvedValue({
      recordId: 'rec_managed',
      fields: {
        Title: 'adapter-feishu',
        Severity: 'critical',
        Source: 'managed-form'
      }
    });

    const response = await dispatchFormWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/form-webhook',
        rawBody: JSON.stringify({
          formKey: 'pms-intake',
          clientToken: validClientToken,
          fields: {
            title: 'adapter-feishu',
            severity: 'critical'
          }
        })
      },
      {
        bitableClient: {
          createRecord
        },
        userIdType: 'user_id',
        formRegistry: createManagedFormRegistry()
      }
    );

    expect(createRecord).toHaveBeenCalledWith({
      appToken: 'app_token_managed',
      tableId: 'tbl_managed',
      clientToken: validClientToken,
      userIdType: 'user_id',
      fields: {
        Title: 'adapter-feishu',
        Severity: 'critical',
        Source: 'managed-form'
      }
    });
    expect(response).toEqual({
      statusCode: 200,
      body: {
        code: 0,
        status: 'record_created',
        recordId: 'rec_managed',
        clientToken: validClientToken,
        targetSource: 'managed',
        target: {
          appToken: 'app_token_managed',
          tableId: 'tbl_managed',
          formId: 'form_managed'
        }
      }
    });
  });

  it('lets managed mode reuse schema validation before record creation', async () => {
    const createRecord = vi.fn().mockResolvedValue({
      recordId: 'rec_managed_schema',
      fields: {
        Title: 'adapter-feishu',
        Severity: 'critical',
        Source: 'managed-form'
      }
    });
    const getForm = vi.fn().mockResolvedValue({ formId: 'form_managed' });
    const listFormFields = vi.fn().mockResolvedValue({
      items: [
        { fieldId: 'fld_title', title: 'Title', required: true, visible: true },
        { fieldId: 'fld_severity', title: 'Severity', required: true, visible: true },
        { fieldId: 'fld_source', title: 'Source', required: false, visible: true }
      ],
      hasMore: false
    });
    const listTableFields = vi.fn().mockResolvedValue({
      items: [
        { fieldId: 'fld_title', fieldName: 'Title' },
        { fieldId: 'fld_severity', fieldName: 'Severity' },
        { fieldId: 'fld_source', fieldName: 'Source' }
      ],
      hasMore: false
    });

    const response = await dispatchFormWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/form-webhook',
        rawBody: JSON.stringify({
          formKey: 'pms-intake',
          clientToken: validClientToken,
          fields: {
            title: 'adapter-feishu',
            severity: 'critical'
          }
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
        formRegistry: createManagedFormRegistry({
          policy: {
            validateFormSchemaByDefault: true,
            rejectUnmappedFields: true
          }
        })
      }
    );

    expect(getForm).toHaveBeenCalledWith({
      appToken: 'app_token_managed',
      tableId: 'tbl_managed',
      formId: 'form_managed'
    });
    expect(createRecord).toHaveBeenCalledWith({
      appToken: 'app_token_managed',
      tableId: 'tbl_managed',
      clientToken: validClientToken,
      userIdType: 'user_id',
      fields: {
        Title: 'adapter-feishu',
        Severity: 'critical',
        Source: 'managed-form'
      }
    });
    expect(response.body).toMatchObject({
      code: 0,
      status: 'record_created',
      schemaValidated: true,
      targetSource: 'managed'
    });
  });

  it('reports managed fieldMap drift through the existing schema validation surface', async () => {
    const createRecord = vi.fn();

    const response = await dispatchFormWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/form-webhook',
        rawBody: JSON.stringify({
          formKey: 'pms-intake',
          clientToken: validClientToken,
          fields: {
            title: 'adapter-feishu',
            severity: 'critical'
          }
        })
      },
      {
        bitableClient: {
          createRecord,
          getForm: vi.fn().mockResolvedValue({ formId: 'form_managed' }),
          listFormFields: vi.fn().mockResolvedValue({
            items: [
              { fieldId: 'fld_title', title: 'Title', required: true, visible: true },
              { fieldId: 'fld_severity', title: 'Severity', required: true, visible: true },
              { fieldId: 'fld_source', title: 'Source', required: false, visible: true }
            ],
            hasMore: false
          }),
          listTableFields: vi.fn().mockResolvedValue({
            items: [
              { fieldId: 'fld_title', fieldName: 'Title' },
              { fieldId: 'fld_severity', fieldName: 'Severity' },
              { fieldId: 'fld_source', fieldName: 'Source' }
            ],
            hasMore: false
          })
        },
        userIdType: 'user_id',
        formRegistry: createManagedFormRegistry({
          fieldMap: {
            title: 'RenamedTitle',
            severity: 'Severity'
          },
          policy: {
            validateFormSchemaByDefault: true,
            rejectUnmappedFields: true
          }
        })
      }
    );

    expect(createRecord).not.toHaveBeenCalled();
    expect(response).toEqual({
      statusCode: 400,
      body: {
        code: 400,
        message: 'invalid_payload',
        errors: ['required_field_missing:Title', 'field_not_in_form:RenamedTitle']
      }
    });
  });

  it('returns stable managed-mode errors for formKey resolve, target shielding, and unmapped fields', async () => {
    const createRecord = vi.fn();
    const registry = createManagedFormRegistry();

    const [noRegistry, unknownFormKey, targetOverride, unmappedField, disabledFormKey] = await Promise.all([
      dispatchFormWebhookRequest(
        {
          method: 'POST',
          pathname: '/providers/form-webhook',
          rawBody: JSON.stringify({
            formKey: 'pms-intake',
            clientToken: validClientToken,
            fields: { title: 'adapter-feishu' }
          })
        },
        {
          bitableClient: { createRecord },
          userIdType: 'user_id'
        }
      ),
      dispatchFormWebhookRequest(
        {
          method: 'POST',
          pathname: '/providers/form-webhook',
          rawBody: JSON.stringify({
            formKey: 'unknown-form',
            clientToken: validClientToken,
            fields: { title: 'adapter-feishu' }
          })
        },
        {
          bitableClient: { createRecord },
          userIdType: 'user_id',
          formRegistry: registry
        }
      ),
      dispatchFormWebhookRequest(
        {
          method: 'POST',
          pathname: '/providers/form-webhook',
          rawBody: JSON.stringify({
            formKey: 'pms-intake',
            clientToken: validClientToken,
            target: { appToken: 'app_token_override', tableId: 'tbl_override' },
            fields: { title: 'adapter-feishu' }
          })
        },
        {
          bitableClient: { createRecord },
          userIdType: 'user_id',
          allowTargetOverride: true,
          formRegistry: registry
        }
      ),
      dispatchFormWebhookRequest(
        {
          method: 'POST',
          pathname: '/providers/form-webhook',
          rawBody: JSON.stringify({
            formKey: 'pms-intake',
            clientToken: validClientToken,
            fields: { title: 'adapter-feishu', unknown: 'blocked' }
          })
        },
        {
          bitableClient: { createRecord },
          userIdType: 'user_id',
          formRegistry: registry
        }
      ),
      dispatchFormWebhookRequest(
        {
          method: 'POST',
          pathname: '/providers/form-webhook',
          rawBody: JSON.stringify({
            formKey: 'pms-intake',
            clientToken: validClientToken,
            fields: { title: 'adapter-feishu' }
          })
        },
        {
          bitableClient: { createRecord },
          userIdType: 'user_id',
          formRegistry: createManagedFormRegistry({ enabled: false })
        }
      )
    ]);

    expect(createRecord).not.toHaveBeenCalled();
    expect(noRegistry.body).toEqual({
      code: 400,
      message: 'invalid_payload',
      errors: ['form_registry_not_configured']
    });
    expect(unknownFormKey.body).toEqual({
      code: 400,
      message: 'invalid_payload',
      errors: ['form_key_unknown:unknown-form']
    });
    expect(targetOverride.body).toEqual({
      code: 400,
      message: 'invalid_payload',
      errors: ['target_not_allowed_for_managed_form']
    });
    expect(unmappedField.body).toEqual({
      code: 400,
      message: 'invalid_payload',
      errors: ['field_not_mapped:unknown']
    });
    expect(disabledFormKey.body).toEqual({
      code: 400,
      message: 'invalid_payload',
      errors: ['form_key_disabled:pms-intake']
    });
  });

  it('rejects attempts to override fixed managed fields through mapped input', async () => {
    const createRecord = vi.fn();

    const response = await dispatchFormWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/form-webhook',
        rawBody: JSON.stringify({
          formKey: 'pms-intake',
          clientToken: validClientToken,
          fields: {
            title: 'adapter-feishu',
            source: 'caller-controlled'
          }
        })
      },
      {
        bitableClient: { createRecord },
        userIdType: 'user_id',
        formRegistry: createManagedFormRegistry({
          fieldMap: {
            title: 'Title',
            source: 'Source'
          }
        })
      }
    );

    expect(createRecord).not.toHaveBeenCalled();
    expect(response).toEqual({
      statusCode: 400,
      body: {
        code: 400,
        message: 'invalid_payload',
        errors: ['fixed_field_conflict:Source']
      }
    });
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
        targetSource: 'override',
        target: {
          appToken: 'app_token_override',
          tableId: 'tbl_override',
          formId: 'form_override'
        }
      }
    });
    expect(second).toEqual({
      statusCode: 202,
      body: {
        code: 0,
        status: 'duplicate_ignored',
        clientToken: validClientToken,
        targetSource: 'override',
        target: {
          appToken: 'app_token_override',
          tableId: 'tbl_override',
          formId: 'form_override'
        }
      }
    });
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
        targetSource: 'default',
        target: {
          appToken: 'app_token_default',
          tableId: 'tbl_default',
          formId: 'form_default'
        }
      }
    });
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
