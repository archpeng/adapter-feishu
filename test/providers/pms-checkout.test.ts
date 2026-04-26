import { describe, expect, it } from 'vitest';
import {
  PMS_CHECKOUT_CONFIRM_ACTION_ID,
  PMS_CHECKOUT_PROVIDER_KEY,
  parsePmsCheckoutConfirmActionValue,
  pmsCheckoutConfirmAction,
  pmsCheckoutFacts,
  renderPmsCheckoutDryRunCard,
  toPmsCheckoutConfirmRequest,
  type PmsCheckoutDryRunCardInput
} from '../../src/providers/pms-checkout/index.js';

const dryRun: PmsCheckoutDryRunCardInput = {
  roomId: 'room-1001',
  roomNumber: '1001',
  currentStatus: { occupancy: 'dueOut', cleaning: 'clean', sale: 'sellable' },
  nextStatus: { occupancy: 'vacant', cleaning: 'dirty', sale: 'sellable' },
  taskPreview: 'Create checkout-cleaning housekeeping task.',
  reason: 'Guest departed and returned room cards.',
  actor: { type: 'human', id: 'frontdesk-1', displayName: 'Front Desk' },
  correlationId: 'corr-pms-checkout-1001',
  idempotencyKey: 'idem-pms-checkout-1001',
  requestFingerprint: 'sha256:pms-checkout-1001',
  requestedAt: '2026-04-26T00:00:00.000Z'
};

describe('PMS checkout Feishu card contract', () => {
  it('renders dry-run card facts without owning PMS transition rules', () => {
    expect(pmsCheckoutFacts(dryRun)).toEqual([
      { label: 'Room', value: '1001 (room-1001)' },
      { label: 'Current status', value: 'dueOut/clean/sellable' },
      { label: 'Next status', value: 'vacant/dirty/sellable' },
      { label: 'Task preview', value: 'Create checkout-cleaning housekeeping task.' },
      { label: 'Reason', value: 'Guest departed and returned room cards.' },
      { label: 'Actor', value: 'Front Desk (human:frontdesk-1)' },
      { label: 'Correlation', value: 'corr-pms-checkout-1001' },
      { label: 'Idempotency', value: 'idem-pms-checkout-1001' }
    ]);

    const card = renderPmsCheckoutDryRunCard(dryRun, 'pending-1');
    expect(card).toMatchObject({
      header: { title: { content: 'Checkout dry-run: room 1001' } },
      elements: expect.arrayContaining([
        expect.objectContaining({ tag: 'action' })
      ])
    });
  });

  it('encodes confirmation callback with prior dry-run correlation and idempotency context', () => {
    const action = pmsCheckoutConfirmAction(dryRun, 'pending-1');

    expect(action).toEqual({
      actionId: PMS_CHECKOUT_CONFIRM_ACTION_ID,
      label: 'Confirm checkout',
      style: 'primary',
      payload: {
        providerKey: PMS_CHECKOUT_PROVIDER_KEY,
        pendingId: 'pending-1',
        actionId: PMS_CHECKOUT_CONFIRM_ACTION_ID,
        roomId: 'room-1001',
        correlationId: 'corr-pms-checkout-1001',
        idempotencyKey: 'idem-pms-checkout-1001',
        requestFingerprint: 'sha256:pms-checkout-1001',
        confirmMode: 'confirm'
      }
    });
  });

  it('validates stale or malformed confirmation payloads before mapping to PMS confirm request', () => {
    expect(parsePmsCheckoutConfirmActionValue({ providerKey: PMS_CHECKOUT_PROVIDER_KEY })).toBeNull();
    expect(parsePmsCheckoutConfirmActionValue({
      providerKey: PMS_CHECKOUT_PROVIDER_KEY,
      pendingId: 'pending-1',
      actionId: 'wrong-action',
      roomId: dryRun.roomId,
      correlationId: dryRun.correlationId,
      idempotencyKey: dryRun.idempotencyKey,
      requestFingerprint: dryRun.requestFingerprint,
      confirmMode: 'confirm'
    })).toBeNull();

    const parsed = parsePmsCheckoutConfirmActionValue(pmsCheckoutConfirmAction(dryRun, 'pending-1').payload ?? {});
    expect(parsed).toEqual({
      providerKey: PMS_CHECKOUT_PROVIDER_KEY,
      pendingId: 'pending-1',
      actionId: PMS_CHECKOUT_CONFIRM_ACTION_ID,
      roomId: 'room-1001',
      correlationId: 'corr-pms-checkout-1001',
      idempotencyKey: 'idem-pms-checkout-1001',
      requestFingerprint: 'sha256:pms-checkout-1001',
      confirmMode: 'confirm'
    });
  });

  it('maps a validated callback to a PMS API confirm request projection, not PMS Core internals', () => {
    const parsed = parsePmsCheckoutConfirmActionValue(pmsCheckoutConfirmAction(dryRun, 'pending-1').payload ?? {});
    if (!parsed) throw new Error('expected parsed action');

    expect(toPmsCheckoutConfirmRequest({
      action: parsed,
      actor: dryRun.actor,
      reason: 'Human confirmed checkout in Feishu card.',
      requestedAt: '2026-04-26T00:01:00.000Z'
    })).toEqual({
      operation: 'pms_check_out',
      mode: 'confirm',
      roomId: 'room-1001',
      actor: dryRun.actor,
      source: 'api',
      reason: 'Human confirmed checkout in Feishu card.',
      idempotencyKey: 'idem-pms-checkout-1001',
      correlationId: 'corr-pms-checkout-1001',
      requestedAt: '2026-04-26T00:01:00.000Z',
      requestFingerprint: 'sha256:pms-checkout-1001'
    });
  });
});
