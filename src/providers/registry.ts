import type { ProviderKey } from '../core/contracts.js';
import type { AnyProviderDefinition } from './contracts.js';

export interface ProviderRegistryOptions {
  allowedProviderKeys?: readonly ProviderKey[];
  defaultProviderKey?: ProviderKey;
}

export interface RegisteredProvider<TDefinition extends AnyProviderDefinition = AnyProviderDefinition> {
  providerKey: ProviderKey;
  definition: TDefinition;
}

export interface ProviderRegistry {
  readonly allowedProviderKeys?: readonly ProviderKey[];
  readonly defaultProviderKey?: ProviderKey;
  registerProvider<TDefinition extends AnyProviderDefinition>(
    definition: TDefinition
  ): RegisteredProvider<TDefinition>;
  getProvider(providerKey: ProviderKey): RegisteredProvider | undefined;
  requireProvider(providerKey: ProviderKey): RegisteredProvider;
  listProviders(): RegisteredProvider[];
}

export function createProviderRegistry(options: ProviderRegistryOptions = {}): ProviderRegistry {
  const allowedProviderKeys = normalizeAllowedProviderKeys(options.allowedProviderKeys);

  if (
    options.defaultProviderKey &&
    allowedProviderKeys &&
    !allowedProviderKeys.includes(options.defaultProviderKey)
  ) {
    throw new Error(
      `Default provider must be included in allowed provider keys: ${options.defaultProviderKey}`
    );
  }

  const providers = new Map<ProviderKey, RegisteredProvider>();

  return {
    allowedProviderKeys,
    defaultProviderKey: options.defaultProviderKey,
    registerProvider<TDefinition extends AnyProviderDefinition>(
      definition: TDefinition
    ): RegisteredProvider<TDefinition> {
      assertValidProviderKey(definition.providerKey);
      assertProviderKeyEnabled(definition.providerKey, allowedProviderKeys);

      if (providers.has(definition.providerKey)) {
        throw new Error(`Provider already registered: ${definition.providerKey}`);
      }

      const entry: RegisteredProvider<TDefinition> = {
        providerKey: definition.providerKey,
        definition
      };

      providers.set(definition.providerKey, entry);
      return entry;
    },
    getProvider(providerKey) {
      return providers.get(providerKey);
    },
    requireProvider(providerKey) {
      const provider = providers.get(providerKey);
      if (!provider) {
        throw new Error(`Provider not registered: ${providerKey}`);
      }
      return provider;
    },
    listProviders() {
      return [...providers.values()];
    }
  };
}

export function registerProvider<TDefinition extends AnyProviderDefinition>(
  registry: ProviderRegistry,
  definition: TDefinition
): RegisteredProvider<TDefinition> {
  return registry.registerProvider(definition);
}

function normalizeAllowedProviderKeys(
  providerKeys: readonly ProviderKey[] | undefined
): readonly ProviderKey[] | undefined {
  if (!providerKeys) {
    return undefined;
  }

  const normalized = [...new Set(providerKeys.map((providerKey) => providerKey.trim()).filter(Boolean))];
  return normalized.length > 0 ? Object.freeze(normalized) : undefined;
}

function assertProviderKeyEnabled(
  providerKey: ProviderKey,
  allowedProviderKeys: readonly ProviderKey[] | undefined
): void {
  if (allowedProviderKeys && !allowedProviderKeys.includes(providerKey)) {
    throw new Error(`Provider key is not enabled in this registry: ${providerKey}`);
  }
}

function assertValidProviderKey(providerKey: ProviderKey): void {
  if (providerKey.trim() === '') {
    throw new Error('Provider key must be a non-empty string');
  }
}
