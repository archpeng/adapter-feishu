import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createAlertDeduper } from '../../src/state/dedupe.js';
import { createTableWriteQueue } from '../../src/state/tableWriteQueue.js';
import { dispatchFormWebhookRequest } from '../../src/server/formWebhook.js';
import { parseManagedFormRegistry, type ManagedFormRegistry } from '../../src/forms/registry.js';
import { validClientToken, redactedTargetFields, expectNoRawTargetInResponse, createManagedFormRegistry, createPmsManagedFormRegistry, createSchemaClient } from './formWebhook.helpers.js';
describe('dispatchFormWebhookRequest', () => {
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
        ...redactedTargetFields('managed', registry.forms[routeCase.formKey].target)
      });
      expectNoRawTargetInResponse(response, [
        registry.forms[routeCase.formKey].target.appToken,
        registry.forms[routeCase.formKey].target.tableId,
        registry.forms[routeCase.formKey].target.formId ?? ''
      ].filter(Boolean));
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
        ...redactedTargetFields('managed', registry.forms['pms-checkout'].target)
      }
    });
    expectNoRawTargetInResponse(second, [
      registry.forms['pms-checkout'].target.appToken,
      registry.forms['pms-checkout'].target.tableId,
      registry.forms['pms-checkout'].target.formId ?? ''
    ].filter(Boolean));
  });


});
