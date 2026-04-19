import type {
  DeliveryTarget,
  ProviderDeliveryResult,
  ProviderNotification
} from '../../core/contracts.js';
import { renderInteractiveCard } from '../../cards/templates.js';
import type { FeishuMessageSendClient } from './types.js';

export interface ReplySink {
  sendNotification(notification: ProviderNotification): Promise<ProviderDeliveryResult>;
}

export function createReplySink(client: FeishuMessageSendClient): ReplySink {
  return {
    async sendNotification(notification) {
      const target = requireTarget(notification.target);
      const deliveredAt = new Date().toISOString();

      if (shouldSendCard(notification)) {
        const response = await client.sendCard(
          target,
          renderInteractiveCard({
            title: notification.title,
            summary: notification.summary,
            severity: notification.severity,
            bodyMarkdown: notification.bodyMarkdown,
            facts: notification.facts,
            actions: notification.actions
          })
        );

        return buildResult(notification, target, deliveredAt, response.messageId, 'interactive card sent');
      }

      const response = await client.sendText(target, `${notification.title}\n\n${notification.summary}`);
      return buildResult(notification, target, deliveredAt, response.messageId, 'text message sent');
    }
  };
}

function shouldSendCard(notification: ProviderNotification): boolean {
  return Boolean(
    notification.bodyMarkdown ||
      notification.severity ||
      (notification.facts && notification.facts.length > 0) ||
      (notification.actions && notification.actions.length > 0)
  );
}

function requireTarget(target: DeliveryTarget | undefined): DeliveryTarget {
  if (!target) {
    throw new Error('Provider notification target is required for Feishu delivery');
  }
  return target;
}

function buildResult(
  notification: ProviderNotification,
  target: DeliveryTarget,
  deliveredAt: string,
  externalRef: string | undefined,
  message: string
): ProviderDeliveryResult {
  return {
    providerKey: notification.providerKey,
    deliveryId: `delivery-${notification.notificationId}`,
    channel: 'feishu',
    status: 'delivered',
    deliveredAt,
    target,
    externalRef,
    dedupeKey: notification.dedupeKey,
    message
  };
}
