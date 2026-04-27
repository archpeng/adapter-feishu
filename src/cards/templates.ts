import type {
  NotificationSeverity,
  ProviderAction,
  ProviderFact
} from '../core/contracts.js';

export interface RenderTextCardParams {
  title: string;
  content: string;
}

export interface RenderInteractiveCardParams {
  title: string;
  summary: string;
  severity?: NotificationSeverity;
  bodyMarkdown?: string;
  facts?: ProviderFact[];
  actions?: ProviderAction[];
}

export function renderTextCard(params: RenderTextCardParams): Record<string, unknown> {
  return {
    header: {
      template: 'blue',
      title: {
        tag: 'plain_text',
        content: params.title
      }
    },
    elements: [
      {
        tag: 'markdown',
        content: params.content
      }
    ]
  };
}

export function renderInteractiveCard(params: RenderInteractiveCardParams): Record<string, unknown> {
  const elements: Array<Record<string, unknown>> = [
    {
      tag: 'markdown',
      content: `**Summary**\n${params.summary}`
    }
  ];

  if (params.bodyMarkdown) {
    elements.push({
      tag: 'markdown',
      content: params.bodyMarkdown
    });
  }

  if (params.facts && params.facts.length > 0) {
    elements.push({
      tag: 'div',
      fields: params.facts.map((fact) => ({
        is_short: true,
        text: {
          tag: 'lark_md',
          content: `**${fact.label}**\n${fact.value}`
        }
      }))
    });
  }

  if (params.actions && params.actions.length > 0) {
    elements.push({
      tag: 'action',
      actions: params.actions.map((action) => {
        const value = {
          actionId: action.actionId,
          ...action.payload
        };

        return {
          tag: 'button',
          type: mapActionStyle(action.style),
          text: {
            tag: 'plain_text',
            content: action.label
          },
          value,
          behaviors: [
            {
              type: 'callback',
              value
            }
          ]
        };
      })
    });
  }

  return {
    header: {
      template: mapSeverityTemplate(params.severity),
      title: {
        tag: 'plain_text',
        content: params.title
      }
    },
    elements
  };
}

function mapSeverityTemplate(severity: NotificationSeverity | undefined): string {
  switch (severity) {
    case 'critical':
      return 'red';
    case 'warning':
      return 'yellow';
    case 'info':
    default:
      return 'blue';
  }
}

function mapActionStyle(style: ProviderAction['style']): string {
  switch (style) {
    case 'primary':
      return 'primary';
    case 'danger':
      return 'danger';
    case 'default':
    default:
      return 'default';
  }
}
