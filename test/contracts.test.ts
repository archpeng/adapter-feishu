import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  DeliveryChannel,
  InboundTurn,
  ProviderAlertSubmission,
  ProviderDeliveryResult,
  ProviderNotification
} from '../src/core/contracts.js';

describe('core contracts', () => {
  it('keeps the bootstrap contract examples assignable', () => {
    const inboundTurn: InboundTurn = {
      turnId: 'turn-001',
      channel: 'feishu',
      intent: 'callback',
      receivedAt: '2026-04-19T08:00:00.000Z',
      providerKey: 'warning-agent',
      target: {
        channel: 'feishu',
        chatId: 'oc_test'
      },
      callback: {
        actionId: 'approve',
        value: {
          workflowRunId: 'wr_123'
        }
      },
      rawEvent: {
        type: 'card.action.trigger'
      },
      metadata: {
        tenantKey: 'tenant-demo'
      }
    };

    const notification: ProviderNotification = {
      providerKey: 'warning-agent',
      notificationId: 'notif-001',
      occurredAt: '2026-04-19T08:00:00.000Z',
      title: 'warning-agent diagnosis completed',
      summary: 'cpu anomaly investigated',
      severity: 'warning',
      target: {
        channel: 'feishu',
        chatId: 'oc_test'
      },
      bodyMarkdown: 'Root cause points to deployment config drift.',
      facts: [
        {
          label: 'cluster',
          value: 'prod-cn-1'
        }
      ],
      actions: [
        {
          actionId: 'open-report',
          label: 'Open report',
          style: 'primary',
          payload: {
            reportId: 'report-9'
          }
        }
      ],
      dedupeKey: 'incident-123',
      rawPayload: {
        status: 'completed'
      }
    };

    const alertSubmission: ProviderAlertSubmission = {
      providerKey: 'warning-agent',
      submissionId: 'submission-001',
      sourceSystem: 'prometheus',
      occurredAt: '2026-04-19T08:00:00.000Z',
      title: 'High CPU usage',
      summary: 'cpu > 90% for 10 minutes',
      dedupeKey: 'cpu-prod-app-1',
      labels: {
        severity: 'critical'
      },
      annotations: {
        runbook: 'https://runbooks.local/high-cpu'
      },
      target: {
        channel: 'feishu',
        chatId: 'oc_test'
      },
      rawPayload: {
        alertname: 'HighCPU'
      }
    };

    const deliveryResult: ProviderDeliveryResult = {
      providerKey: 'warning-agent',
      deliveryId: 'delivery-001',
      channel: 'feishu',
      status: 'accepted',
      target: {
        channel: 'feishu',
        chatId: 'oc_test'
      },
      message: 'queued for card delivery'
    };

    expect(inboundTurn.callback?.actionId).toBe('approve');
    expect(notification.actions?.[0]?.style).toBe('primary');
    expect(alertSubmission.sourceSystem).toBe('prometheus');
    expect(deliveryResult.status).toBe('accepted');

    expectTypeOf(inboundTurn.channel).toEqualTypeOf<DeliveryChannel>();
    expectTypeOf(notification.target?.channel).toEqualTypeOf<DeliveryChannel | undefined>();
  });
});
