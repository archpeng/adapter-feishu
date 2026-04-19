import { describe, expect, it } from 'vitest';
import type { JsonRecord } from '../../src/core/contracts.js';
import type { ProviderDefinition } from '../../src/providers/contracts.js';
import { createProviderRegistry, registerProvider } from '../../src/providers/registry.js';
import { createProviderRouter } from '../../src/providers/router.js';

function createProvider(providerKey: string): ProviderDefinition<JsonRecord> {
  return {
    providerKey,
    supportsNotification: () => true,
    async deliverNotification() {
      return {
        providerKey,
        deliveryId: `delivery-${providerKey}`,
        channel: 'feishu',
        status: 'accepted'
      };
    }
  };
}

describe('provider router', () => {
  it('resolves an explicit provider key when override is allowed', () => {
    const registry = createProviderRegistry({
      allowedProviderKeys: ['warning-agent', 'ops-bot'],
      defaultProviderKey: 'warning-agent'
    });
    registerProvider(registry, createProvider('warning-agent'));
    registerProvider(registry, createProvider('ops-bot'));

    const router = createProviderRouter(registry, {
      defaultProviderKey: 'warning-agent',
      allowProviderOverride: true
    });

    const resolution = router.resolve({ providerKey: 'ops-bot' });

    expect(resolution.providerKey).toBe('ops-bot');
    expect(resolution.resolutionSource).toBe('explicit');
    expect(resolution.provider.definition.providerKey).toBe('ops-bot');
  });

  it('falls back to the configured default provider when override is disabled', () => {
    const registry = createProviderRegistry({
      allowedProviderKeys: ['warning-agent', 'ops-bot'],
      defaultProviderKey: 'warning-agent'
    });
    registerProvider(registry, createProvider('warning-agent'));
    registerProvider(registry, createProvider('ops-bot'));

    const router = createProviderRouter(registry, {
      defaultProviderKey: 'warning-agent',
      allowProviderOverride: false
    });

    const resolution = router.resolve({ providerKey: 'ops-bot' });

    expect(resolution.providerKey).toBe('warning-agent');
    expect(resolution.resolutionSource).toBe('default');
    expect(resolution.requestedProviderKey).toBe('ops-bot');
  });

  it('uses the configured default provider when inbound payload has no explicit key', () => {
    const registry = createProviderRegistry({
      allowedProviderKeys: ['warning-agent'],
      defaultProviderKey: 'warning-agent'
    });
    registerProvider(registry, createProvider('warning-agent'));

    const router = createProviderRouter(registry);
    const resolution = router.resolve({});

    expect(resolution.providerKey).toBe('warning-agent');
    expect(resolution.resolutionSource).toBe('default');
  });

  it('fails when no explicit provider key or default provider is available', () => {
    const registry = createProviderRegistry();
    const router = createProviderRouter(registry);

    expect(() => router.resolve({})).toThrow(
      'Unable to resolve provider: no explicit provider key and no default provider configured'
    );
  });
});
