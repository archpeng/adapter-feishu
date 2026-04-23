import { describe, expect, it } from 'vitest';
import { renderWarningAgentDiagnosisCard } from '../../../src/providers/warning-agent/cards.js';

describe('renderWarningAgentDiagnosisCard', () => {
  it('renders a warning-agent diagnosis payload as an interactive Feishu card', () => {
    const card = renderWarningAgentDiagnosisCard(
      {
        reportId: 'report-9',
        runId: 'wr_123',
        severity: 'critical',
        summary: 'database connections exhausted',
        bodyMarkdown: 'Pool saturation detected on the primary shard.',
        reportUrl: 'https://warning-agent.local/reports/report-9'
      },
      {
        defaultTarget: {
          channel: 'feishu',
          chatId: 'oc-chat-1'
        }
      }
    );

    expect(card).toMatchObject({
      header: {
        template: 'red',
        title: {
          content: 'warning-agent diagnosis report-9'
        }
      }
    });

    expect((card as { elements: unknown[] }).elements).toEqual(
      expect.arrayContaining([
        {
          tag: 'markdown',
          content: '**Summary**\ndatabase connections exhausted'
        },
        {
          tag: 'markdown',
          content: 'Pool saturation detected on the primary shard.'
        }
      ])
    );
  });
});
