import type { DeliveryTarget, ProviderAction, ProviderFact, JsonRecord } from '../../core/contracts.js';

export const PMS_CHECKOUT_PROVIDER_KEY = 'pms-checkout';
export const PMS_CHECKOUT_CONFIRM_ACTION_ID = 'pms.checkout.confirm';

export interface PmsCheckoutActorRef {
  readonly type: 'human' | 'ai' | 'system';
  readonly id: string;
  readonly displayName?: string;
}

export interface PmsRoomStatusProjection {
  readonly occupancy: string;
  readonly cleaning: string;
  readonly sale: string;
}

export interface PmsCheckoutDryRunCardInput {
  readonly roomId: string;
  readonly roomNumber: string;
  readonly currentStatus: PmsRoomStatusProjection;
  readonly nextStatus: PmsRoomStatusProjection;
  readonly taskPreview: string;
  readonly reason: string;
  readonly actor: PmsCheckoutActorRef;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly requestedAt: string;
  readonly target?: DeliveryTarget;
}

export type PmsCheckoutResultProjection =
  | {
      readonly ok: true;
      readonly roomId: string;
      readonly roomNumber: string;
      readonly previousStatus: PmsRoomStatusProjection;
      readonly nextStatus: PmsRoomStatusProjection;
      readonly housekeepingTaskId: string;
      readonly auditId: string;
      readonly eventTypes: readonly ['RoomCheckedOut', 'HousekeepingTaskCreated'];
      readonly actor: PmsCheckoutActorRef;
      readonly correlationId: string;
      readonly idempotencyKey: string;
      readonly occurredAt: string;
    }
  | {
      readonly ok: false;
      readonly roomId?: string;
      readonly roomNumber?: string;
      readonly errors: readonly { readonly code: string; readonly message: string; readonly field?: string }[];
      readonly actor: PmsCheckoutActorRef;
      readonly correlationId: string;
      readonly idempotencyKey: string;
      readonly occurredAt: string;
    };

export interface PmsCheckoutConfirmActionValue {
  readonly providerKey: typeof PMS_CHECKOUT_PROVIDER_KEY;
  readonly pendingId: string;
  readonly actionId: typeof PMS_CHECKOUT_CONFIRM_ACTION_ID;
  readonly roomId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly confirmMode: 'confirm';
}

export interface PmsCheckoutConfirmRequestProjection {
  readonly operation: 'pms_check_out';
  readonly mode: 'confirm';
  readonly roomId: string;
  readonly actor: PmsCheckoutActorRef;
  readonly source: 'api' | 'mcp' | 'test';
  readonly reason: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly requestedAt: string;
  readonly requestFingerprint: string;
}

export function pmsCheckoutFacts(input: PmsCheckoutDryRunCardInput): ProviderFact[] {
  return [
    { label: 'Room', value: `${input.roomNumber} (${input.roomId})` },
    { label: 'Current status', value: statusText(input.currentStatus) },
    { label: 'Next status', value: statusText(input.nextStatus) },
    { label: 'Task preview', value: input.taskPreview },
    { label: 'Reason', value: input.reason },
    { label: 'Actor', value: actorText(input.actor) },
    { label: 'Correlation', value: input.correlationId },
    { label: 'Idempotency', value: input.idempotencyKey }
  ];
}

export function pmsCheckoutConfirmAction(input: PmsCheckoutDryRunCardInput, pendingId: string): ProviderAction {
  return {
    actionId: PMS_CHECKOUT_CONFIRM_ACTION_ID,
    label: 'Confirm checkout',
    style: 'primary',
    payload: {
      providerKey: PMS_CHECKOUT_PROVIDER_KEY,
      pendingId,
      actionId: PMS_CHECKOUT_CONFIRM_ACTION_ID,
      roomId: input.roomId,
      correlationId: input.correlationId,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      confirmMode: 'confirm'
    }
  };
}

export function parsePmsCheckoutConfirmActionValue(value: JsonRecord): PmsCheckoutConfirmActionValue | null {
  if (
    value.providerKey !== PMS_CHECKOUT_PROVIDER_KEY ||
    value.actionId !== PMS_CHECKOUT_CONFIRM_ACTION_ID ||
    value.confirmMode !== 'confirm'
  ) {
    return null;
  }

  const pendingId = stringField(value, 'pendingId');
  const roomId = stringField(value, 'roomId');
  const correlationId = stringField(value, 'correlationId');
  const idempotencyKey = stringField(value, 'idempotencyKey');
  const requestFingerprint = stringField(value, 'requestFingerprint');

  if (!pendingId || !roomId || !correlationId || !idempotencyKey || !requestFingerprint) {
    return null;
  }

  return {
    providerKey: PMS_CHECKOUT_PROVIDER_KEY,
    pendingId,
    actionId: PMS_CHECKOUT_CONFIRM_ACTION_ID,
    roomId,
    correlationId,
    idempotencyKey,
    requestFingerprint,
    confirmMode: 'confirm'
  };
}

export function toPmsCheckoutConfirmRequest(input: {
  readonly action: PmsCheckoutConfirmActionValue;
  readonly actor: PmsCheckoutActorRef;
  readonly reason: string;
  readonly requestedAt: string;
}): PmsCheckoutConfirmRequestProjection {
  return {
    operation: 'pms_check_out',
    mode: 'confirm',
    roomId: input.action.roomId,
    actor: input.actor,
    source: 'api',
    reason: input.reason,
    idempotencyKey: input.action.idempotencyKey,
    correlationId: input.action.correlationId,
    requestedAt: input.requestedAt,
    requestFingerprint: input.action.requestFingerprint
  };
}

function statusText(status: PmsRoomStatusProjection): string {
  return `${status.occupancy}/${status.cleaning}/${status.sale}`;
}

function actorText(actor: PmsCheckoutActorRef): string {
  return actor.displayName ? `${actor.displayName} (${actor.type}:${actor.id})` : `${actor.type}:${actor.id}`;
}

function stringField(value: JsonRecord, key: string): string | undefined {
  const candidate = value[key];
  return typeof candidate === 'string' && candidate.trim() ? candidate : undefined;
}
