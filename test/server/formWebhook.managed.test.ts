import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createAlertDeduper } from '../../src/state/dedupe.js';
import { createTableWriteQueue } from '../../src/state/tableWriteQueue.js';
import { dispatchFormWebhookRequest } from '../../src/server/formWebhook.js';
import { parseManagedFormRegistry, type ManagedFormRegistry } from '../../src/forms/registry.js';
import { validClientToken, redactedTargetFields, expectNoRawTargetInResponse, createManagedFormRegistry, createPmsManagedFormRegistry, createSchemaClient } from './formWebhook.helpers.js';
describe('dispatchFormWebhookRequest', () => {
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
        ...redactedTargetFields('managed', {
          appToken: 'app_token_managed',
          tableId: 'tbl_managed',
          formId: 'form_managed'
        })
      }
    });
    expectNoRawTargetInResponse(response, ['app_token_managed', 'tbl_managed', 'form_managed']);
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


});
