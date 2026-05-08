import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, vi } from 'vitest';
import { parseManagedFormRegistry, type ManagedFormRegistry } from '../../src/forms/registry.js';

export const validClientToken = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

export function redactedTargetFields(
  targetSource: 'default' | 'override' | 'managed',
  target: { appToken: string; tableId: string; formId?: string }
) {
  return {
    targetSource,
    targetConfigured: true,
    targetRefHash: createHash('sha256')
      .update(`${target.appToken}:${target.tableId}:${target.formId ?? ''}`)
      .digest('hex')
      .slice(0, 16),
    rawTargetLogged: false
  };
}

export function expectNoRawTargetInResponse(response: unknown, rawValues: readonly (string | undefined)[]): void {
  const serialized = JSON.stringify(response);
  for (const rawValue of rawValues) {
    if (!rawValue) continue;
    expect(serialized).not.toContain(rawValue);
  }
}

export function createManagedFormRegistry(overrides: Partial<ManagedFormRegistry['forms'][string]> = {}): ManagedFormRegistry {
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

export function createPmsManagedFormRegistry(
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

export function createSchemaClient(
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
