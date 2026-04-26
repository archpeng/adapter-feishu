import { describe, expect, it } from 'vitest';
import { renderPmsCheckoutResultCard, type PmsCheckoutResultProjection } from '../../src/providers/pms-checkout/index.js';

const success: PmsCheckoutResultProjection = {
  ok: true,
  roomId: 'room-1001',
  roomNumber: '1001',
  previousStatus: { occupancy: 'dueOut', cleaning: 'clean', sale: 'sellable' },
  nextStatus: { occupancy: 'vacant', cleaning: 'dirty', sale: 'sellable' },
  housekeepingTaskId: 'task-checkout-1001',
  auditId: 'audit-checkout-1001',
  eventTypes: ['RoomCheckedOut', 'HousekeepingTaskCreated'],
  actor: { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' },
  correlationId: 'corr-pms-checkout-1001',
  idempotencyKey: 'idem-pms-checkout-1001',
  occurredAt: '2026-04-26T00:00:00.000Z'
};

describe('PMS checkout result projection cards', () => {
  it('renders PMS success results as Feishu-visible projection with audit and event references', () => {
    const card = renderPmsCheckoutResultCard(success);

    expect(card).toMatchObject({
      header: { title: { content: 'Checkout complete: room 1001' } },
      elements: expect.arrayContaining([
        expect.objectContaining({ tag: 'div' })
      ])
    });
    expect(JSON.stringify(card)).toContain('task-checkout-1001');
    expect(JSON.stringify(card)).toContain('audit-checkout-1001');
    expect(JSON.stringify(card)).toContain('RoomCheckedOut, HousekeepingTaskCreated');
    expect(JSON.stringify(card)).toContain('PMS Core remains the canonical checkout truth');
  });

  it('renders PMS failures as structured Feishu feedback without pretending Feishu owns state', () => {
    const failed: PmsCheckoutResultProjection = {
      ok: false,
      roomId: 'room-1001',
      roomNumber: '1001',
      errors: [
        {
          code: 'ROOM_NOT_CHECKOUTABLE',
          message: 'Room is not in a checkoutable occupancy state.',
          field: 'room.occupancyStatus'
        }
      ],
      actor: success.actor,
      correlationId: success.correlationId,
      idempotencyKey: success.idempotencyKey,
      occurredAt: success.occurredAt
    };

    const card = renderPmsCheckoutResultCard(failed);

    expect(card).toMatchObject({
      header: { template: 'yellow', title: { content: 'Checkout failed: room 1001' } }
    });
    expect(JSON.stringify(card)).toContain('ROOM_NOT_CHECKOUTABLE');
    expect(JSON.stringify(card)).toContain('PMS rejected the checkout command');
  });
});
