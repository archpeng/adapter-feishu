import { describe, expect, it } from 'vitest';
import {
  isWarningAgentNotificationPayload,
  validateWarningAgentNotificationPayload
} from '../../../src/providers/warning-agent/contracts.js';

describe('warning-agent notification payload contract', () => {
  it('accepts the notify-first payload shape used by adapter-feishu', () => {
    const payload = {
      reportId: 'report-9',
      runId: 'wr_123',
      summary: 'cpu anomaly investigated',
      severity: 'warning',
      reportUrl: 'https://warning-agent.local/reports/report-9',
      target: {
        channel: 'feishu',
        chatId: 'oc-chat-1'
      },
      facts: [
        {
          label: 'cluster',
          value: 'prod-cn-1'
        }
      ]
    };

    expect(validateWarningAgentNotificationPayload(payload)).toEqual([]);
    expect(isWarningAgentNotificationPayload(payload)).toBe(true);
  });

  it('rejects malformed payload fields with concrete validation errors', () => {
    const payload = {
      reportId: '',
      runId: 1,
      summary: 'cpu anomaly investigated',
      severity: 'warn',
      target: {
        channel: 'slack'
      },
      actions: [
        {
          actionId: '',
          label: 'Open report',
          style: 'loud'
        }
      ]
    };

    expect(validateWarningAgentNotificationPayload(payload as never)).toEqual([
      'reportId must be a non-empty string',
      'runId must be a non-empty string',
      'severity must be one of info, warning, critical',
      'target.channel must be feishu',
      'target must include chatId, openId, userId, or unionId',
      'actions[0].actionId must be a non-empty string',
      'actions[0].style must be default, primary, or danger'
    ]);
    expect(isWarningAgentNotificationPayload(payload as never)).toBe(false);
  });
});
