import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const architectureDoc = readFileSync(
  new URL('../docs/architecture/adapter-feishu-architecture.md', import.meta.url),
  'utf8'
);

const boundaryAnchors = [
  'standalone Feishu/Lark channel service',
  'provider-neutral adapter core',
  'provider-specific integrations live under `src/providers/**`',
  'Boston-Bot runtime is not the adapter core'
];

describe('documentation boundary freeze', () => {
  it('keeps README and architecture doc aligned on the repo boundary', () => {
    for (const anchor of boundaryAnchors) {
      expect(readme).toContain(anchor);
      expect(architectureDoc).toContain(anchor);
    }
  });
});
