import { renderInteractiveCard } from '../../cards/templates.js';
import {
  pmsCheckoutConfirmAction,
  pmsCheckoutFacts,
  type PmsCheckoutDryRunCardInput,
  type PmsCheckoutResultProjection
} from './contracts.js';

export function renderPmsCheckoutDryRunCard(input: PmsCheckoutDryRunCardInput, pendingId: string): Record<string, unknown> {
  return renderInteractiveCard({
    title: `Checkout dry-run: room ${input.roomNumber}`,
    summary: `PMS proposes checkout for room ${input.roomNumber}. Confirm only after human review.`,
    severity: 'info',
    bodyMarkdown: [
      '**PMS preview only.**',
      'Confirming will call the PMS API/MCP confirm path; Feishu does not own the checkout state machine.'
    ].join('\n'),
    facts: pmsCheckoutFacts(input),
    actions: [pmsCheckoutConfirmAction(input, pendingId)]
  });
}

export function renderPmsCheckoutResultCard(result: PmsCheckoutResultProjection): Record<string, unknown> {
  if (!result.ok) {
    return renderInteractiveCard({
      title: `Checkout failed${result.roomNumber ? `: room ${result.roomNumber}` : ''}`,
      summary: result.errors.map((error) => `${error.code}: ${error.message}`).join('\n'),
      severity: 'warning',
      bodyMarkdown: 'PMS rejected the checkout command. Feishu is showing structured PMS feedback only.',
      facts: [
        ...(result.roomId ? [{ label: 'Room ID', value: result.roomId }] : []),
        { label: 'Actor', value: actorText(result.actor) },
        { label: 'Correlation', value: result.correlationId },
        { label: 'Idempotency', value: result.idempotencyKey }
      ]
    });
  }

  return renderInteractiveCard({
    title: `Checkout complete: room ${result.roomNumber}`,
    summary: `PMS checked out room ${result.roomNumber} and created housekeeping task ${result.housekeepingTaskId}.`,
    severity: 'info',
    bodyMarkdown: 'PMS Core remains the canonical checkout truth; this Feishu card is a projection.',
    facts: [
      { label: 'Room', value: `${result.roomNumber} (${result.roomId})` },
      { label: 'Previous status', value: statusText(result.previousStatus) },
      { label: 'Next status', value: statusText(result.nextStatus) },
      { label: 'Task', value: result.housekeepingTaskId },
      { label: 'Audit', value: result.auditId },
      { label: 'Events', value: result.eventTypes.join(', ') },
      { label: 'Actor', value: actorText(result.actor) },
      { label: 'Correlation', value: result.correlationId },
      { label: 'Idempotency', value: result.idempotencyKey }
    ]
  });
}

function statusText(status: { readonly occupancy: string; readonly cleaning: string; readonly sale: string }): string {
  return `${status.occupancy}/${status.cleaning}/${status.sale}`;
}

function actorText(actor: { readonly type: string; readonly id: string; readonly displayName?: string }): string {
  return actor.displayName ? `${actor.displayName} (${actor.type}:${actor.id})` : `${actor.type}:${actor.id}`;
}
