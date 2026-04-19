import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { InboundTurn, JsonRecord, ProviderAlertSubmission } from '../../src/core/contracts.js';
import type { ProviderDefinition, ProviderExecutionContext } from '../../src/providers/contracts.js';

type WarningAgentNotification = JsonRecord & {
  reportId: string;
  runId: string;
  summary: string;
};

function createExecutionContext(providerKey: string): ProviderExecutionContext {
  return {
    replySink: {
      sendNotification: vi.fn().mockResolvedValue({
        providerKey,
        deliveryId: `delivery-${providerKey}`,
        channel: 'feishu',
        status: 'delivered'
      })
    },
    now: () => '2026-04-19T08:00:00.000Z'
  };
}

describe('provider contracts', () => {
  it('supports provider-specific notification payloads without leaking them into shared contracts', async () => {
    const context = createExecutionContext('warning-agent');
    const provider: ProviderDefinition<WarningAgentNotification> = {
      providerKey: 'warning-agent',
      supportsNotification(payload): payload is WarningAgentNotification {
        return (
          typeof payload.reportId === 'string' &&
          typeof payload.runId === 'string' &&
          typeof payload.summary === 'string'
        );
      },
      async deliverNotification(payload, executionContext) {
        return executionContext.replySink.sendNotification({
          providerKey: 'warning-agent',
          notificationId: payload.reportId,
          occurredAt: executionContext.now?.() ?? '2026-04-19T08:00:00.000Z',
          title: `warning-agent report ${payload.reportId}`,
          summary: payload.summary,
          rawPayload: payload
        });
      }
    };

    const candidate: JsonRecord = {
      reportId: 'report-9',
      runId: 'wr_123',
      summary: 'cpu anomaly investigated'
    };

    expect(provider.supportsNotification(candidate)).toBe(true);

    if (!provider.supportsNotification(candidate)) {
      throw new Error('expected notification type guard to narrow the payload');
    }

    expectTypeOf(candidate.reportId).toEqualTypeOf<string>();

    const result = await provider.deliverNotification(candidate, context);

    expect(context.replySink.sendNotification).toHaveBeenCalledWith({
      providerKey: 'warning-agent',
      notificationId: 'report-9',
      occurredAt: '2026-04-19T08:00:00.000Z',
      title: 'warning-agent report report-9',
      summary: 'cpu anomaly investigated',
      rawPayload: candidate
    });
    expect(result.status).toBe('delivered');
  });

  it('keeps alert submission and callback handlers optional and provider-neutral', async () => {
    const context = createExecutionContext('notify-only');
    const provider: ProviderDefinition = {
      providerKey: 'notify-only',
      supportsNotification: () => false,
      async deliverNotification() {
        return {
          providerKey: 'notify-only',
          deliveryId: 'delivery-notify-only',
          channel: 'feishu',
          status: 'ignored',
          message: 'notification payload not supported'
        };
      },
      supportsAlertSubmission(payload): payload is ProviderAlertSubmission {
        return payload.sourceSystem === 'prometheus';
      },
      async submitAlert(payload) {
        return {
          providerKey: 'notify-only',
          status: 'accepted',
          message: payload.sourceSystem
        };
      },
      async handleCallback(payload: InboundTurn) {
        return {
          providerKey: 'notify-only',
          status: 'ignored',
          message: payload.callback?.actionId ?? 'missing-callback'
        };
      }
    };

    const alertSubmission: ProviderAlertSubmission = {
      providerKey: 'notify-only',
      submissionId: 'submission-1',
      sourceSystem: 'prometheus',
      occurredAt: '2026-04-19T08:00:00.000Z',
      title: 'High CPU usage',
      summary: 'cpu > 90% for 10 minutes',
      rawPayload: {
        alertname: 'HighCPU'
      }
    };

    const callbackTurn: InboundTurn = {
      turnId: 'turn-1',
      channel: 'feishu',
      intent: 'callback',
      receivedAt: '2026-04-19T08:05:00.000Z',
      providerKey: 'notify-only',
      target: {
        channel: 'feishu',
        chatId: 'oc_test'
      },
      callback: {
        actionId: 'acknowledge'
      },
      rawEvent: {
        type: 'card.action.trigger'
      }
    };

    if (!provider.supportsAlertSubmission || !provider.submitAlert) {
      throw new Error('expected alert support to be available in this test fixture');
    }

    expect(provider.supportsAlertSubmission(alertSubmission)).toBe(true);
    const alertResult = await provider.submitAlert(alertSubmission, context);
    const callbackResult = await provider.handleCallback?.(callbackTurn, context);

    expect(alertResult.status).toBe('accepted');
    expect(alertResult.message).toBe('prometheus');
    expect(callbackResult?.message).toBe('acknowledge');
  });
});
