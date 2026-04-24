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
const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const registryExampleRaw = readFileSync(
  new URL('../config/form-bindings.example.json', import.meta.url),
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
  });
});
