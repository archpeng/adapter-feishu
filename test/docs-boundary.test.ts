import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const agents = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
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
  'targetSource": "managed"',
  'targetConfigured',
  'targetRefHash',
  'rawTargetLogged'
];

const pmsAgentPathAnchors = [
  'Feishu PMS natural-language turn -> adapter-feishu -> pms-agent-v2 -> pms-platform',
  'natural-language PMS command turns are allowlist/dedupe guarded and forwarded to `pms-agent-v2`',
  '/health` exposes only non-sensitive PMS Agent config state',
  'PMS Agent approval cards are rendered by adapter-feishu as typed cards'
];

const iterationLawAnchors = [
  'README must name the active `Feishu -> adapter-feishu -> pms-agent-v2 -> pms-platform` chain',
  '/health` must expose non-sensitive integration config state',
  'Form webhook success and duplicate responses must not expose raw Feishu Base target IDs',
  'explicit typed builders/parsers instead of unchecked `as unknown as` casts',
  'single-responsibility helper extraction'
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

    expect(envExample).toContain('ADAPTER_FEISHU_FORM_REGISTRY_PATH=config/pms-form-bindings.example.json');

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
      'pms-housekeeping-done',
      'pms-operation-request'
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

    expect(pmsRegistryExample.forms?.['pms-operation-request']).toMatchObject({
      target: {
        appToken: 'example_pms_base_app_token',
        tableId: 'example_pms_operation_requests_table',
        formId: 'example_pms_operation_request_form'
      },
      fixedFields: {
        source: 'external_form',
        ingress: 'formKey:pms-operation-request',
        schemaVersion: 'pms-operation-request-intake-v1'
      },
      policy: {
        validateFormSchemaByDefault: false,
        rejectUnmappedFields: true
      }
    });
    expect(pmsRegistryExampleRaw).toContain('Action');
    expect(pmsRegistryExampleRaw).not.toContain(['ai', 'pms', 'operation', 'request', 'intake'].join('_'));
    expect(pmsRegistryExampleRaw).not.toContain('app_secret');
    expect(pmsRegistryExampleRaw).not.toContain('bascn');
    expect(formRunbook).toContain('ADAPTER_FEISHU_FORM_REGISTRY_PATH=config/pms-form-bindings.example.json');
    expect(formRunbook).toContain('docs/runbook/adapter-feishu-pms-base-setup.md');
    expect(formRunbook).toContain('CHECK_OUT');
    expect(formRunbook).toContain('REPORT_MAINTENANCE');
    expect(formRunbook).toContain('HOUSEKEEPING_DONE');
    expect(formRunbook).toContain('They do not return raw `appToken`, `tableId`, or `formId`.');
  });

  it('keeps pms-agent-v2 as the documented natural-language PMS path', () => {
    for (const anchor of pmsAgentPathAnchors) {
      expect(readme).toContain(anchor);
    }

    for (const anchor of iterationLawAnchors) {
      expect(agents).toContain(anchor);
    }

    expect(envExample).toContain('PMS_AGENT_TURN_URL');
    expect(envExample).toContain('PMS_AGENT_AUTH_TOKEN');
    expect(envExample).not.toContain('ADAPTER_FEISHU_CONVERSATION_TURN_URL');
    expect(envExample).not.toContain('AI_CONVERSATION_INBOUND_AUTH_TOKEN');
  });

  it('keeps PMS Base schema ownership delegated to pms-platform', () => {
    for (const requiredAnchor of [
      '/home/peng/dt-git/github/pms-platform/packages/provisioning/src/index.ts',
      '/home/peng/dt-git/github/pms-platform/docs/pms-base-provisioning-v1.md',
      'PmsBaseProvisioningSpec',
      'createSmallHotelPmsBaseProvisioningSpec()',
      'ADAPTER_FEISHU_PMS_BASE_REGISTRY_PATH',
      'pms_base_dashboard_projection',
      'pms_base_upsert_operation_request',
      'pms_base_upsert_inventory_calendar_projection',
      'pms_base_prune_inventory_calendar_projection',
      'pms_base_today_departures_projection',
      'It does **not** own the PMS Base table schema',
      'Tracked example registry files are placeholders only'
    ]) {
      expect(pmsBaseSetupRunbook).toContain(requiredAnchor);
    }

    for (const oldSchemaAnchor of [
      '### 3.1 `Room Ledger`',
      '### 3.2 `PMS Operation Requests`',
      'Frontdesk Room Wall',
      'GuestDisplayName',
      'PhoneLast4'
    ]) {
      expect(pmsBaseSetupRunbook).not.toContain(oldSchemaAnchor);
    }

    expect(pmsBaseSetupRunbook).not.toContain('app_secret');
    expect(pmsBaseSetupRunbook).not.toContain('bascn');
  });
});
