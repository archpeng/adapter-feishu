import { describe, expect, it, vi } from 'vitest';
import { createWarningAgentProvider } from '../../../src/providers/warning-agent/index.js';

describe('createWarningAgentProvider', () => {
  it('delivers warning-agent notifications through the shared reply sink', async () => {
    const replySink = {
      sendNotification: vi.fn().mockResolvedValue({
        providerKey: 'warning-agent',
        deliveryId: 'delivery-1',
        channel: 'feishu',
        status: 'delivered'
      })
    };
    const provider = createWarningAgentProvider({
      defaultTarget: {
        channel: 'feishu',
        chatId: 'oc-chat-1'
      },
      now: () => '2026-04-20T00:00:00.000Z'
    });

    const payload = {
      reportId: 'report-9',
      runId: 'wr_123',
      summary: 'cpu anomaly investigated',
      reportUrl: 'https://warning-agent.local/reports/report-9'
    };

    expect(provider.supportsNotification(payload)).toBe(true);
    if (!provider.supportsNotification(payload)) {
      throw new Error('expected payload to satisfy warning-agent type guard');
    }

    const result = await provider.deliverNotification(payload, {
      replySink,
      defaultTarget: {
        channel: 'feishu',
        chatId: 'oc-chat-1'
      },
      now: () => '2026-04-20T00:00:00.000Z'
    });

    expect(replySink.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKey: 'warning-agent',
        notificationId: 'report-9',
        target: {
          channel: 'feishu',
          chatId: 'oc-chat-1'
        }
      })
    );
    expect(result.status).toBe('delivered');
  });
});
