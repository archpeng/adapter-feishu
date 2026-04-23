import { describe, expect, it, vi } from 'vitest';
import { createReplySink } from '../../../src/channels/feishu/replySink.js';
import type { ProviderNotification } from '../../../src/core/contracts.js';

describe('createReplySink', () => {
  it('sends plain text for simple notifications', async () => {
    const client = {
      sendText: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
      sendCard: vi.fn().mockResolvedValue({ messageId: 'msg-2' })
    };
    const sink = createReplySink(client);
    const notification: ProviderNotification = {
      providerKey: 'warning-agent',
      notificationId: 'notif-1',
      occurredAt: '2026-04-19T08:00:00.000Z',
      title: 'warning-agent diagnosis completed',
      summary: 'cpu anomaly investigated',
      target: {
        channel: 'feishu',
        chatId: 'oc-chat-1'
      },
      rawPayload: {
        status: 'completed'
      }
    };

    const result = await sink.sendNotification(notification);

    expect(client.sendText).toHaveBeenCalledWith(
      { channel: 'feishu', chatId: 'oc-chat-1' },
      'warning-agent diagnosis completed\n\ncpu anomaly investigated'
    );
    expect(client.sendCard).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      providerKey: 'warning-agent',
      channel: 'feishu',
      status: 'delivered',
      externalRef: 'msg-1'
    });
  });

  it('sends an interactive card for rich notifications', async () => {
    const client = {
      sendText: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
      sendCard: vi.fn().mockResolvedValue({ messageId: 'msg-2' })
    };
    const sink = createReplySink(client);
    const notification: ProviderNotification = {
      providerKey: 'warning-agent',
      notificationId: 'notif-2',
      occurredAt: '2026-04-19T08:00:00.000Z',
      title: 'warning-agent diagnosis completed',
      summary: 'cpu anomaly investigated',
      severity: 'warning',
      target: {
        channel: 'feishu',
        openId: 'ou-user-1'
      },
      bodyMarkdown: 'Root cause points to deployment drift.',
      facts: [
        { label: 'cluster', value: 'prod-cn-1' }
      ],
      actions: [
        {
          actionId: 'open-report',
          label: 'Open report',
          style: 'primary',
          payload: { reportId: 'report-1' }
        }
      ],
      rawPayload: {
        status: 'completed'
      }
    };

    const result = await sink.sendNotification(notification);

    expect(client.sendCard).toHaveBeenCalledTimes(1);
    expect(client.sendCard).toHaveBeenCalledWith(
      { channel: 'feishu', openId: 'ou-user-1' },
      expect.objectContaining({
        header: expect.objectContaining({ template: 'yellow' })
      })
    );
    expect(result).toMatchObject({
      providerKey: 'warning-agent',
      channel: 'feishu',
      status: 'delivered',
      externalRef: 'msg-2'
    });
  });
});
