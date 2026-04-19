import { describe, expect, it } from 'vitest';
import {
  WARNING_AGENT_PROVIDER_KEY,
  normalizeWarningAgentNotification,
  type WarningAgentNotificationPayload
} from '../../../src/providers/warning-agent/normalize.js';

describe('normalizeWarningAgentNotification', () => {
  it('maps a warning-agent report payload into the shared provider notification contract', () => {
    const payload: WarningAgentNotificationPayload = {
      reportId: 'report-9',
      runId: 'wr_123',
      incidentId: 'incident-1',
      severity: 'warning',
      summary: 'cpu anomaly investigated',
      bodyMarkdown: 'Root cause points to deployment config drift.',
      reportUrl: 'https://warning-agent.local/reports/report-9'
    };

    const notification = normalizeWarningAgentNotification(payload, {
      now: () => '2026-04-20T00:00:00.000Z',
      defaultTarget: {
        channel: 'feishu',
        chatId: 'oc-chat-1'
      }
    });

    expect(notification).toEqual({
      providerKey: WARNING_AGENT_PROVIDER_KEY,
      notificationId: 'report-9',
      occurredAt: '2026-04-20T00:00:00.000Z',
      title: 'warning-agent diagnosis report-9',
      summary: 'cpu anomaly investigated',
      severity: 'warning',
      target: {
        channel: 'feishu',
        chatId: 'oc-chat-1'
      },
      bodyMarkdown: 'Root cause points to deployment config drift.',
      facts: [
        { label: 'report', value: 'report-9' },
        { label: 'run', value: 'wr_123' },
        { label: 'incident', value: 'incident-1' }
      ],
      actions: [
        {
          actionId: 'open-report',
          label: 'Open report',
          style: 'primary',
          payload: {
            reportId: 'report-9',
            reportUrl: 'https://warning-agent.local/reports/report-9'
          }
        }
      ],
      dedupeKey: 'incident-1',
      rawPayload: payload,
      metadata: {
        runId: 'wr_123',
        reportUrl: 'https://warning-agent.local/reports/report-9'
      }
    });
  });
});
