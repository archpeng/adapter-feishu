import type { ProviderKey } from '../core/contracts.js';
import type { ProviderRegistry, RegisteredProvider } from './registry.js';

export interface ProviderRouteInput {
  providerKey?: ProviderKey;
}

export interface ProviderRouterOptions {
  defaultProviderKey?: ProviderKey;
  allowProviderOverride?: boolean;
}

export interface ProviderRouteResolution {
  providerKey: ProviderKey;
  provider: RegisteredProvider;
  resolutionSource: 'explicit' | 'default';
  requestedProviderKey?: ProviderKey;
}

export interface ProviderRouter {
  readonly defaultProviderKey?: ProviderKey;
  readonly allowProviderOverride: boolean;
  resolve(input: ProviderRouteInput): ProviderRouteResolution;
}

export function createProviderRouter(
  registry: ProviderRegistry,
  options: ProviderRouterOptions = {}
): ProviderRouter {
  const defaultProviderKey = options.defaultProviderKey ?? registry.defaultProviderKey;
  const allowProviderOverride = options.allowProviderOverride ?? false;

  return {
    defaultProviderKey,
    allowProviderOverride,
    resolve(input) {
      const requestedProviderKey = normalizeProviderKey(input.providerKey);
      const { providerKey, resolutionSource } = resolveProviderKey(
        requestedProviderKey,
        defaultProviderKey,
        allowProviderOverride
      );

      return {
        providerKey,
        provider: registry.requireProvider(providerKey),
        resolutionSource,
        requestedProviderKey
      };
    }
  };
}

function resolveProviderKey(
  requestedProviderKey: ProviderKey | undefined,
  defaultProviderKey: ProviderKey | undefined,
  allowProviderOverride: boolean
): Pick<ProviderRouteResolution, 'providerKey' | 'resolutionSource'> {
  if (requestedProviderKey && (allowProviderOverride || !defaultProviderKey || requestedProviderKey === defaultProviderKey)) {
    return {
      providerKey: requestedProviderKey,
      resolutionSource: 'explicit'
    };
  }

  if (defaultProviderKey) {
    return {
      providerKey: defaultProviderKey,
      resolutionSource: 'default'
    };
  }

  if (requestedProviderKey) {
    return {
      providerKey: requestedProviderKey,
      resolutionSource: 'explicit'
    };
  }

  throw new Error('Unable to resolve provider: no explicit provider key and no default provider configured');
}

function normalizeProviderKey(providerKey: ProviderKey | undefined): ProviderKey | undefined {
  const normalized = providerKey?.trim();
  return normalized ? normalized : undefined;
}
