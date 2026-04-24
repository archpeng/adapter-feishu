import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const architectureDoc = readFileSync(
  new URL('../docs/architecture/adapter-feishu-architecture.md', import.meta.url),
  'utf8'
);
const formRunbook = readFileSync(
  new URL('../docs/runbook/adapter-feishu-form-integration.md', import.meta.url),
  'utf8'
);
const pmsBaseSetupRunbook = readFileSync(
  new URL('../docs/runbook/adapter-feishu-pms-base-setup.md', import.meta.url),
  'utf8'
);
const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const registryExampleRaw = readFileSync(
  new URL('../config/form-bindings.example.json', import.meta.url),
  'utf8'
);
const pmsRegistryExampleRaw = readFileSync(
  new URL('../config/pms-form-bindings.example.json', import.meta.url),
  'utf8'
);

const boundaryAnchors = [
  'standalone Feishu/Lark channel service',
  'provider-neutral adapter core',
  'provider-specific integrations live under `src/providers/**`',
  'Boston-Bot runtime is not the adapter core'
];

const managedFormAnchors = [
  'ADAPTER_FEISHU_FORM_REGISTRY_PATH',
  'formKey',
  'fieldMap',
  'fixedFields',
  'target_not_allowed_for_managed_form',
  'field_not_mapped',
  'fixed_field_conflict',
  'targetSource": "managed"'
];

describe('documentation boundary freeze', () => {
  it('keeps README and architecture doc aligned on the repo boundary', () => {
    for (const anchor of boundaryAnchors) {
      expect(readme).toContain(anchor);
      expect(architectureDoc).toContain(anchor);
    }
  });

  it('keeps managed form routing docs aligned with the tracked registry handoff', () => {
    for (const anchor of managedFormAnchors) {
      expect(readme).toContain(anchor);
      expect(formRunbook).toContain(anchor);
    }

    expect(envExample).toContain('ADAPTER_FEISHU_FORM_REGISTRY_PATH=config/form-bindings.example.json');

    const registryExample = JSON.parse(registryExampleRaw) as {
      version?: unknown;
      forms?: Record<string, unknown>;
    };
    expect(registryExample.version).toBe(1);
    expect(registryExample.forms).toHaveProperty('pms-intake');
    expect(registryExampleRaw).toContain('bascn_example_app_token');
    expect(registryExampleRaw).not.toContain('app_secret');

    const pmsRegistryExample = JSON.parse(pmsRegistryExampleRaw) as {
      version?: unknown;
      forms?: Record<string, { fixedFields?: Record<string, unknown>; policy?: Record<string, unknown> }>;
    };
    expect(pmsRegistryExample.version).toBe(1);
    expect(Object.keys(pmsRegistryExample.forms ?? {})).toEqual([
      'pms-checkout',
      'pms-maintenance-report',
      'pms-housekeeping-done'
    ]);

    for (const formKey of ['pms-checkout', 'pms-maintenance-report', 'pms-housekeeping-done']) {
      const binding = pmsRegistryExample.forms?.[formKey];
      expect(binding?.fixedFields).toMatchObject({
        Source: 'adapter-feishu-pms-smart-intake',
        Ingress: `formKey:${formKey}`,
        SchemaVersion: 'pms-smart-intake-v1'
      });
      expect(binding?.policy).toMatchObject({
        validateFormSchemaByDefault: true,
        rejectUnmappedFields: true
      });
    }

    expect(pmsRegistryExampleRaw).toContain('Action');
    expect(pmsRegistryExampleRaw).not.toContain('app_secret');
    expect(pmsRegistryExampleRaw).not.toContain('bascn');
    expect(formRunbook).toContain('ADAPTER_FEISHU_FORM_REGISTRY_PATH=config/pms-form-bindings.example.json');
    expect(formRunbook).toContain('docs/runbook/adapter-feishu-pms-base-setup.md');
    expect(formRunbook).toContain('CHECK_OUT');
    expect(formRunbook).toContain('REPORT_MAINTENANCE');
    expect(formRunbook).toContain('HOUSEKEEPING_DONE');
  });

  it('keeps the PMS Base setup contract complete enough for sandbox creation', () => {
    for (const tableName of [
      'Room Ledger',
      'PMS Operation Requests',
      'Housekeeping Tasks',
      'Maintenance Tickets',
      'Reservations',
      'Operation Logs',
      'Inventory Calendar'
    ]) {
      expect(pmsBaseSetupRunbook).toContain(tableName);
    }

    for (const viewName of [
      'Frontdesk Room Wall',
      'Today Arrivals',
      'Today Departures',
      'Sellable Rooms',
      'Dirty Rooms',
      'Inspection Queue',
      'Cleaning In Progress',
      'Maintenance Stop-Sell',
      'Exceptions'
    ]) {
      expect(pmsBaseSetupRunbook).toContain(viewName);
    }

    for (const requiredAnchor of [
      'GuestDisplayName',
      'PhoneLast4',
      'PayloadJSON',
      'ResultJSON',
      'target_not_allowed_for_managed_form',
      'field_not_mapped:<name>',
      'fixed_field_conflict:Source/Ingress/Action/SchemaVersion',
      'adapter-feishu` only writes records through the existing `/providers/form-webhook` managed `formKey` route'
    ]) {
      expect(pmsBaseSetupRunbook).toContain(requiredAnchor);
    }

    expect(pmsBaseSetupRunbook).not.toContain('app_secret');
    expect(pmsBaseSetupRunbook).not.toContain('bascn');
  });
});
