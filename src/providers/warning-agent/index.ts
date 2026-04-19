import type { DeliveryTarget } from '../../core/contracts.js';
import type { ProviderDefinition } from '../contracts.js';
import {
  isWarningAgentNotificationPayload,
  WARNING_AGENT_PROVIDER_KEY,
  type WarningAgentNotificationPayload
} from './contracts.js';
import {
  normalizeWarningAgentNotification,
  type NormalizeWarningAgentNotificationOptions
} from './normalize.js';

export interface WarningAgentProviderOptions extends NormalizeWarningAgentNotificationOptions {
  defaultTarget?: DeliveryTarget;
}

export function createWarningAgentProvider(
  options: WarningAgentProviderOptions = {}
): ProviderDefinition<WarningAgentNotificationPayload> {
  return {
    providerKey: WARNING_AGENT_PROVIDER_KEY,
    supportsNotification(payload): payload is WarningAgentNotificationPayload {
      return isWarningAgentNotificationPayload(payload);
    },
    async deliverNotification(payload, context) {
      return context.replySink.sendNotification(
        normalizeWarningAgentNotification(payload, {
          defaultTarget: options.defaultTarget ?? context.defaultTarget,
          now: options.now ?? context.now
        })
      );
    }
  };
}

export * from './cards.js';
export * from './client.js';
export * from './contracts.js';
export * from './normalize.js';
