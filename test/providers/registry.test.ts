import { describe, expect, it } from 'vitest';
import type { JsonRecord } from '../../src/core/contracts.js';
import type { ProviderDefinition } from '../../src/providers/contracts.js';
import { createProviderRegistry, registerProvider } from '../../src/providers/registry.js';

function createProvider(providerKey: string): ProviderDefinition<JsonRecord> {
  return {
    providerKey,
    supportsNotification: () => true,
    async deliverNotification(payload) {
      return {
        providerKey,
        deliveryId: `delivery-${providerKey}`,
        channel: 'feishu',
        status: 'accepted',
        message: JSON.stringify(payload)
      };
    }
  };
}

describe('provider registry', () => {
  it('registers and resolves multiple providers by key without cross-coupling', () => {
    const registry = createProviderRegistry({
      allowedProviderKeys: ['warning-agent', 'ops-bot'],
      defaultProviderKey: 'warning-agent'
    });

    const warningAgent = registerProvider(registry, createProvider('warning-agent'));
    const opsBot = registerProvider(registry, createProvider('ops-bot'));

    expect(registry.defaultProviderKey).toBe('warning-agent');
    expect(registry.listProviders().map((entry) => entry.providerKey)).toEqual([
      'warning-agent',
      'ops-bot'
    ]);
    expect(registry.getProvider('warning-agent')).toBe(warningAgent);
    expect(registry.requireProvider('ops-bot')).toBe(opsBot);
  });

  it('rejects duplicate or disabled provider keys', () => {
    const registry = createProviderRegistry({
      allowedProviderKeys: ['warning-agent']
    });

    registerProvider(registry, createProvider('warning-agent'));

    expect(() => registerProvider(registry, createProvider('warning-agent'))).toThrow(
      'Provider already registered: warning-agent'
    );
    expect(() => registerProvider(registry, createProvider('ops-bot'))).toThrow(
      'Provider key is not enabled in this registry: ops-bot'
    );
  });

  it('fails fast when registry defaults are inconsistent or a required provider is missing', () => {
    expect(() =>
      createProviderRegistry({
        allowedProviderKeys: ['warning-agent'],
        defaultProviderKey: 'ops-bot'
      })
    ).toThrow('Default provider must be included in allowed provider keys: ops-bot');

    const registry = createProviderRegistry();
    expect(() => registry.requireProvider('missing-provider')).toThrow(
      'Provider not registered: missing-provider'
    );
  });
});
