import { describe, expect, it } from 'vitest';
import { renderInteractiveCard, renderTextCard } from '../../src/cards/templates.js';

describe('renderTextCard', () => {
  it('renders a minimal text card payload', () => {
    const card = renderTextCard({
      title: 'adapter-feishu',
      content: 'bootstrap complete'
    });

    expect(card.header.title.content).toBe('adapter-feishu');
    expect(JSON.stringify(card.elements)).toContain('bootstrap complete');
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

    expect(card.header.template).toBe('yellow');
    const body = JSON.stringify(card.elements);
    expect(body).toContain('deployment drift');
    expect(body).toContain('prod-cn-1');
    expect(body).toContain('Open report');
    expect(body).toContain('open-report');
    const actionElement = card.elements.find((element) => element.tag === 'action');
    const button = actionElement?.actions?.[0];
    expect(button.value).toEqual({ actionId: 'open-report', reportId: 'report-1' });
    expect(button.behaviors).toEqual([
      {
        type: 'callback',
        value: { actionId: 'open-report', reportId: 'report-1' }
      }
    ]);
  });

  it('preserves legacy button value while adding explicit callback behavior', () => {
    const card = renderInteractiveCard({
      title: 'PMS checkout dry-run',
      summary: 'Confirm requires typed card action.',
      actions: [
        {
          actionId: 'pms.checkout.confirm',
          label: 'Confirm checkout',
          style: 'primary',
          payload: { pendingId: 'pending-1', confirmMode: 'confirm' }
        }
      ]
    });

    const actionElement = card.elements.find((element) => element.tag === 'action');
    const button = actionElement?.actions?.[0];
    expect(button.value).toEqual({
      actionId: 'pms.checkout.confirm',
      pendingId: 'pending-1',
      confirmMode: 'confirm'
    });
    expect(button.behaviors).toEqual([
      {
        type: 'callback',
        value: {
          actionId: 'pms.checkout.confirm',
          pendingId: 'pending-1',
          confirmMode: 'confirm'
        }
      }
    ]);
  });
});
