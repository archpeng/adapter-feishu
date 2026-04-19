import { describe, expect, it } from 'vitest';
import { renderInteractiveCard, renderTextCard } from '../../src/cards/templates.js';

describe('renderTextCard', () => {
  it('renders a minimal text card payload', () => {
    const card = renderTextCard({
      title: 'adapter-feishu',
      content: 'bootstrap complete'
    });

    expect(card.msg_type).toBe('interactive');
    expect(card.card.header.title.content).toBe('adapter-feishu');
    expect(JSON.stringify(card.card.elements)).toContain('bootstrap complete');
  });
});

describe('renderInteractiveCard', () => {
  it('renders facts and actions into the interactive payload', () => {
    const card = renderInteractiveCard({
      title: 'warning-agent diagnosis completed',
      summary: 'cpu anomaly investigated',
      severity: 'warning',
      bodyMarkdown: 'Root cause points to deployment drift.',
      facts: [
        { label: 'cluster', value: 'prod-cn-1' },
        { label: 'service', value: 'warning-agent' }
      ],
      actions: [
        {
          actionId: 'open-report',
          label: 'Open report',
          style: 'primary',
          payload: { reportId: 'report-1' }
        }
      ]
    });

    expect(card.msg_type).toBe('interactive');
    expect(card.card.header.template).toBe('yellow');
    const body = JSON.stringify(card.card.elements);
    expect(body).toContain('deployment drift');
    expect(body).toContain('prod-cn-1');
    expect(body).toContain('Open report');
    expect(body).toContain('open-report');
  });
});
