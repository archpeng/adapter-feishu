import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createAlertDeduper } from '../../src/state/dedupe.js';
import { createTableWriteQueue } from '../../src/state/tableWriteQueue.js';
import { dispatchFormWebhookRequest } from '../../src/server/formWebhook.js';
import { parseManagedFormRegistry, type ManagedFormRegistry } from '../../src/forms/registry.js';

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

function createPmsManagedFormRegistry(
  overrides: Partial<Record<string, Partial<ManagedFormRegistry['forms'][string]>>> = {}
): ManagedFormRegistry {
  const registry = parseManagedFormRegistry(
    JSON.parse(readFileSync(new URL('../../config/pms-form-bindings.example.json', import.meta.url), 'utf8')),
    'config/pms-form-bindings.example.json'
  );

  for (const [formKey, override] of Object.entries(overrides)) {
    const binding = registry.forms[formKey];
    if (!binding || !override) {
      continue;
    }

    registry.forms[formKey] = {
      ...binding,
      ...override,
      target: {
        ...binding.target,
        ...override.target
      },
      fieldMap: {
        ...binding.fieldMap,
        ...override.fieldMap
      },
      fixedFields: {
        ...binding.fixedFields,
        ...override.fixedFields
      },
      policy: {
        ...binding.policy,
        ...override.policy
      }
    };
  }

  return registry;
}

function createSchemaClient(
  createRecord: ReturnType<typeof vi.fn>,
  fieldNames: string[],
  options: { getFormFailure?: Error } = {}
) {
  const formFields = fieldNames.map((fieldName, index) => ({
    fieldId: `fld_${index}`,
    title: fieldName,
    required: false,
    visible: true
  }));
  const tableFields = fieldNames.map((fieldName, index) => ({
    fieldId: `fld_${index}`,
    fieldName
  }));

  return {
    createRecord,
    getForm: options.getFormFailure
      ? vi.fn().mockRejectedValue(options.getFormFailure)
      : vi.fn().mockResolvedValue({ formId: 'form_pms' }),
    listFormFields: vi.fn().mockResolvedValue({
      items: formFields,
      hasMore: false
    }),
    listTableFields: vi.fn().mockResolvedValue({
      items: tableFields,
      hasMore: false
    })
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

  it('routes all PMS smart-intake formKeys through registry data with fixed-field injection', async () => {
    const registry = createPmsManagedFormRegistry();
    const schemaFieldNames = [
      'RoomNumber',
      'Operator',
      'ReservationCode',
      'RequestedAt',
      'Reason',
      'Notes',
      'Category',
      'Severity',
      'Description',
      'StopSellRequested',
      'AttachmentUrl',
      'TaskId',
      'Result',
      'InspectionRequired',
      'Source',
      'Ingress',
      'Action',
      'SchemaVersion'
    ];
    const cases = [
      {
        formKey: 'pms-checkout',
        fields: {
          roomNumber: '0308',
          operator: 'frontdesk-01',
          reservationCode: 'reservation-demo-1',
          checkoutAt: '2026-04-24T10:30:00+08:00',
          reason: 'guest checked out',
          notes: 'minibar checked'
        },
        expectedFields: {
          RoomNumber: '0308',
          Operator: 'frontdesk-01',
          ReservationCode: 'reservation-demo-1',
          RequestedAt: '2026-04-24T10:30:00+08:00',
          Reason: 'guest checked out',
          Notes: 'minibar checked',
          Source: 'adapter-feishu-pms-smart-intake',
          Ingress: 'formKey:pms-checkout',
          Action: 'CHECK_OUT',
          SchemaVersion: 'pms-smart-intake-v1'
        }
      },
      {
        formKey: 'pms-maintenance-report',
        fields: {
          roomNumber: '0502',
          reporter: 'frontdesk-02',
          category: 'Plumbing',
          severity: 'High',
          description: 'sink leaking',
          stopSell: true,
          photoUrl: 'https://example.invalid/leak-photo',
          notes: 'guest moved'
        },
        expectedFields: {
          RoomNumber: '0502',
          Operator: 'frontdesk-02',
          Category: 'Plumbing',
          Severity: 'High',
          Description: 'sink leaking',
          StopSellRequested: true,
          AttachmentUrl: 'https://example.invalid/leak-photo',
          Notes: 'guest moved',
          Source: 'adapter-feishu-pms-smart-intake',
          Ingress: 'formKey:pms-maintenance-report',
          Action: 'REPORT_MAINTENANCE',
          SchemaVersion: 'pms-smart-intake-v1'
        }
      },
      {
        formKey: 'pms-housekeeping-done',
        fields: {
          roomNumber: '0601',
          operator: 'housekeeping-01',
          taskId: 'HK-20260424-001',
          finishedAt: '2026-04-24T12:00:00+08:00',
          result: 'NeedsInspection',
          inspectionRequired: true,
          notes: 'ready for supervisor'
        },
        expectedFields: {
          RoomNumber: '0601',
          Operator: 'housekeeping-01',
          TaskId: 'HK-20260424-001',
          RequestedAt: '2026-04-24T12:00:00+08:00',
          Result: 'NeedsInspection',
          InspectionRequired: true,
          Notes: 'ready for supervisor',
          Source: 'adapter-feishu-pms-smart-intake',
          Ingress: 'formKey:pms-housekeeping-done',
          Action: 'HOUSEKEEPING_DONE',
          SchemaVersion: 'pms-smart-intake-v1'
        }
      }
    ];

    for (const routeCase of cases) {
      const createRecord = vi.fn().mockResolvedValue({ recordId: `rec_${routeCase.formKey}`, fields: routeCase.expectedFields });
      const response = await dispatchFormWebhookRequest(
        {
          method: 'POST',
          pathname: '/providers/form-webhook',
          rawBody: JSON.stringify({
            formKey: routeCase.formKey,
            clientToken: validClientToken,
            fields: routeCase.fields
          })
        },
        {
          bitableClient: createSchemaClient(createRecord, schemaFieldNames),
          userIdType: 'user_id',
          formRegistry: registry
        }
      );

      expect(createRecord).toHaveBeenCalledWith({
        appToken: 'example_pms_base_app_token',
        tableId: 'example_pms_operation_requests_table',
        clientToken: validClientToken,
        userIdType: 'user_id',
        fields: routeCase.expectedFields
      });
      expect(response.body).toMatchObject({
        code: 0,
        status: 'record_created',
        recordId: `rec_${routeCase.formKey}`,
        clientToken: validClientToken,
        schemaValidated: true,
        targetSource: 'managed',
        target: registry.forms[routeCase.formKey].target
      });
    }
  });

  it('returns stable PMS managed-routing errors for shielding, formKey, mapping, conflict, and schema failures', async () => {
    const createRecord = vi.fn();
    const registry = createPmsManagedFormRegistry();

    const [targetShielding, unknownFormKey, disabledFormKey, unmappedField, fixedConflict] = await Promise.all([
      dispatchFormWebhookRequest(
        {
          method: 'POST',
          pathname: '/providers/form-webhook',
          rawBody: JSON.stringify({
            formKey: 'pms-checkout',
            clientToken: validClientToken,
            target: { appToken: 'caller_app_token', tableId: 'caller_table' },
            fields: { roomNumber: '0308', operator: 'frontdesk-01', checkoutAt: '2026-04-24T10:30:00+08:00', reason: 'done' }
          })
        },
        { bitableClient: { createRecord }, userIdType: 'user_id', allowTargetOverride: true, formRegistry: registry }
      ),
      dispatchFormWebhookRequest(
        {
          method: 'POST',
          pathname: '/providers/form-webhook',
          rawBody: JSON.stringify({
            formKey: 'pms-unknown',
            clientToken: validClientToken,
            fields: { roomNumber: '0308' }
          })
        },
        { bitableClient: { createRecord }, userIdType: 'user_id', formRegistry: registry }
      ),
      dispatchFormWebhookRequest(
        {
          method: 'POST',
          pathname: '/providers/form-webhook',
          rawBody: JSON.stringify({
            formKey: 'pms-maintenance-report',
            clientToken: validClientToken,
            fields: { roomNumber: '0502', reporter: 'frontdesk-02', category: 'Plumbing', severity: 'High', description: 'sink leaking' }
          })
        },
        {
          bitableClient: { createRecord },
          userIdType: 'user_id',
          formRegistry: createPmsManagedFormRegistry({ 'pms-maintenance-report': { enabled: false } })
        }
      ),
      dispatchFormWebhookRequest(
        {
          method: 'POST',
          pathname: '/providers/form-webhook',
          rawBody: JSON.stringify({
            formKey: 'pms-housekeeping-done',
            clientToken: validClientToken,
            fields: { roomNumber: '0601', operator: 'housekeeping-01', finishedAt: '2026-04-24T12:00:00+08:00', result: 'Done', unmapped: 'blocked' }
          })
        },
        { bitableClient: { createRecord }, userIdType: 'user_id', formRegistry: registry }
      ),
      dispatchFormWebhookRequest(
        {
          method: 'POST',
          pathname: '/providers/form-webhook',
          rawBody: JSON.stringify({
            formKey: 'pms-checkout',
            clientToken: validClientToken,
            fields: { roomNumber: '0308', operator: 'frontdesk-01', checkoutAt: '2026-04-24T10:30:00+08:00', reason: 'done', callerAction: 'CALLER_OVERRIDE' }
          })
        },
        {
          bitableClient: { createRecord },
          userIdType: 'user_id',
          formRegistry: createPmsManagedFormRegistry({
            'pms-checkout': {
              fieldMap: {
                callerAction: 'Action'
              }
            }
          })
        }
      )
    ]);

    expect(createRecord).not.toHaveBeenCalled();
    expect(targetShielding.body).toMatchObject({ message: 'invalid_payload', errors: ['target_not_allowed_for_managed_form'] });
    expect(unknownFormKey.body).toMatchObject({ message: 'invalid_payload', errors: ['form_key_unknown:pms-unknown'] });
    expect(disabledFormKey.body).toMatchObject({ message: 'invalid_payload', errors: ['form_key_disabled:pms-maintenance-report'] });
    expect(unmappedField.body).toMatchObject({ message: 'invalid_payload', errors: ['field_not_mapped:unmapped'] });
    expect(fixedConflict.body).toMatchObject({ message: 'invalid_payload', errors: ['fixed_field_conflict:Action'] });

    const schemaDrift = await dispatchFormWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/form-webhook',
        rawBody: JSON.stringify({
          formKey: 'pms-checkout',
          clientToken: validClientToken,
          fields: { roomNumber: '0308', operator: 'frontdesk-01', checkoutAt: '2026-04-24T10:30:00+08:00', reason: 'done' }
        })
      },
      {
        bitableClient: createSchemaClient(vi.fn(), ['Operator', 'RequestedAt', 'Reason', 'Source', 'Ingress', 'Action', 'SchemaVersion']),
        userIdType: 'user_id',
        formRegistry: registry
      }
    );
    expect(schemaDrift.body).toMatchObject({ message: 'invalid_payload', errors: ['field_not_in_form:RoomNumber'] });

    const schemaUpstreamFailure = await dispatchFormWebhookRequest(
      {
        method: 'POST',
        pathname: '/providers/form-webhook',
        rawBody: JSON.stringify({
          formKey: 'pms-checkout',
          clientToken: validClientToken,
          fields: { roomNumber: '0308', operator: 'frontdesk-01', checkoutAt: '2026-04-24T10:30:00+08:00', reason: 'done' }
        })
      },
      {
        bitableClient: createSchemaClient(vi.fn(), ['RoomNumber', 'Operator', 'RequestedAt', 'Reason', 'Source', 'Ingress', 'Action', 'SchemaVersion'], {
          getFormFailure: new Error('permission denied')
        }),
        userIdType: 'user_id',
        formRegistry: registry
      }
    );
    expect(schemaUpstreamFailure).toEqual({
      statusCode: 502,
      body: {
        code: 502,
        message: 'schema_validation_failed',
        error: 'permission denied'
      }
    });
  });

  it('deduplicates repeated PMS managed writes for the same target table and clientToken', async () => {
    const createRecord = vi.fn().mockResolvedValue({ recordId: 'rec_pms_checkout', fields: {} });
    const registry = createPmsManagedFormRegistry();
    const deduper = createAlertDeduper({ ttlMs: 1_000, now: () => 1_000 });
    const request = {
      method: 'POST',
      pathname: '/providers/form-webhook',
      rawBody: JSON.stringify({
        formKey: 'pms-checkout',
        clientToken: validClientToken,
        fields: {
          roomNumber: '0308',
          operator: 'frontdesk-01',
          checkoutAt: '2026-04-24T10:30:00+08:00',
          reason: 'guest checked out'
        }
      })
    };
    const deps = {
      bitableClient: createSchemaClient(createRecord, ['RoomNumber', 'Operator', 'RequestedAt', 'Reason', 'Source', 'Ingress', 'Action', 'SchemaVersion']),
      userIdType: 'user_id' as const,
      formRegistry: registry,
      deduper
    };

    const first = await dispatchFormWebhookRequest(request, deps);
    const second = await dispatchFormWebhookRequest(request, deps);

    expect(createRecord).toHaveBeenCalledTimes(1);
    expect(first.body).toMatchObject({ status: 'record_created', targetSource: 'managed' });
    expect(second).toEqual({
      statusCode: 202,
      body: {
        code: 0,
        status: 'duplicate_ignored',
        clientToken: validClientToken,
        targetSource: 'managed',
        target: registry.forms['pms-checkout'].target
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
