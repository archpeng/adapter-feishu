import type { DeliveryTarget, ProviderAction, ProviderFact, JsonRecord } from '../../core/contracts.js';

export const PMS_CHECKOUT_PROVIDER_KEY = 'pms-checkout';
export const PMS_CHECKOUT_CONFIRM_ACTION_ID = 'pms.checkout.confirm';
export const PMS_CHECKOUT_CONFIRM_CALLBACK_ENVELOPE = 'pms-checkout-confirm-callback-forward.v1';
export const PMS_CHECKOUT_CONFIRM_CALLBACK_NAME = 'pms-checkout-confirm-callback-forward';
export const PMS_CHECKOUT_CONFIRM_CALLBACK_VERSION = 'v1';
export const PMS_CHECKOUT_CONFIRM_CALLBACK_HANDLER = 'ai_pms.pms_checkout.confirm_callback';
export const PMS_CHECKOUT_CALLBACK_AUTH_HEADER = 'X-AI-PMS-CALLBACK-TOKEN';
export const PMS_CHECKOUT_CALLBACK_AUTH_ENV_NAME = 'AI_PMS_CALLBACK_TOKEN';

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

export interface PmsCheckoutDryRunIdentity {
  readonly mode: 'dryRun';
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
}

export interface PmsCheckoutConfirmIdentity {
  readonly mode: 'confirm';
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly confirmMode: 'confirm';
}

export interface PmsCheckoutProjectionTarget {
  readonly kind: 'chat' | 'user' | 'open_id' | 'union_id';
  readonly id: string;
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
  readonly dryRunIdentity: PmsCheckoutDryRunIdentity;
  readonly confirmIdentity: PmsCheckoutConfirmIdentity;
  readonly requestedAt: string;
  readonly target?: DeliveryTarget;
  readonly projectionTarget?: PmsCheckoutProjectionTarget;
}

export type PmsCheckoutResultProjection =
  | {
      readonly ok: true;
      readonly roomId: string;
      readonly roomNumber: string;
      readonly previousStatus: PmsRoomStatusProjection;
      readonly nextStatus: PmsRoomStatusProjection;
      readonly housekeepingTaskId?: string;
      readonly auditId: string;
      readonly eventTypes: readonly ('RoomCheckedOut' | 'HousekeepingTaskCreated')[];
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
  readonly dryRunIdentity: PmsCheckoutDryRunIdentity;
  readonly confirmIdentity: PmsCheckoutConfirmIdentity;
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

export type PmsCheckoutProjectionKind = 'dryRunCard' | 'resultCard';

export type PmsCheckoutProjectionEnvelope = JsonRecord & {
  feishuProjection: {
    providerKey: typeof PMS_CHECKOUT_PROVIDER_KEY;
    projectionKind: PmsCheckoutProjectionKind;
    canonicalSource: 'pms-platform';
    target: PmsCheckoutProjectionTarget;
    payload: JsonRecord;
  };
};

export function pmsCheckoutFacts(input: PmsCheckoutDryRunCardInput): ProviderFact[] {
  return [
    { label: 'Room', value: `${input.roomNumber} (${input.roomId})` },
    { label: 'Current status', value: statusText(input.currentStatus) },
    { label: 'Next status', value: statusText(input.nextStatus) },
    { label: 'Task preview', value: input.taskPreview },
    { label: 'Reason', value: input.reason },
    { label: 'Actor', value: actorText(input.actor) },
    { label: 'Correlation', value: input.correlationId },
    { label: 'Dry-run idempotency', value: input.dryRunIdentity.idempotencyKey },
    { label: 'Confirm idempotency', value: input.confirmIdentity.idempotencyKey }
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
      idempotencyKey: input.confirmIdentity.idempotencyKey,
      requestFingerprint: input.confirmIdentity.requestFingerprint,
      dryRunIdentity: identityToRecord(input.dryRunIdentity),
      confirmIdentity: identityToRecord(input.confirmIdentity),
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
  const dryRunIdentity = parseDryRunIdentity(recordField(value, 'dryRunIdentity'));
  const confirmIdentity = parseConfirmIdentity(recordField(value, 'confirmIdentity'));

  if (
    !pendingId ||
    !roomId ||
    !correlationId ||
    !idempotencyKey ||
    !requestFingerprint ||
    !dryRunIdentity ||
    !confirmIdentity ||
    idempotencyKey !== confirmIdentity.idempotencyKey ||
    requestFingerprint !== confirmIdentity.requestFingerprint ||
    !hasDistinctDryRunAndConfirmIdentity(dryRunIdentity, confirmIdentity)
  ) {
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
    dryRunIdentity,
    confirmIdentity,
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
    idempotencyKey: input.action.confirmIdentity.idempotencyKey,
    correlationId: input.action.correlationId,
    requestedAt: input.requestedAt,
    requestFingerprint: input.action.confirmIdentity.requestFingerprint
  };
}

export function validatePmsCheckoutProjectionEnvelope(value: JsonRecord): string[] {
  const errors: string[] = [];
  const projection = recordField(value, 'feishuProjection');
  if (!projection) {
    return ['feishuProjection must be an object'];
  }

  if (projection.providerKey !== PMS_CHECKOUT_PROVIDER_KEY) {
    errors.push('feishuProjection.providerKey must be pms-checkout');
  }
  if (projection.canonicalSource !== 'pms-platform') {
    errors.push('feishuProjection.canonicalSource must be pms-platform');
  }
  if (projection.projectionKind !== 'dryRunCard' && projection.projectionKind !== 'resultCard') {
    errors.push('feishuProjection.projectionKind must be dryRunCard or resultCard');
  }

  const target = recordField(projection, 'target');
  validateProjectionTarget(errors, target, 'feishuProjection.target');
  const payload = recordField(projection, 'payload');
  if (!payload) {
    errors.push('feishuProjection.payload must be an object');
    return errors;
  }

  if (projection.projectionKind === 'dryRunCard') {
    validateDryRunPayload(errors, payload, 'feishuProjection.payload');
  }
  if (projection.projectionKind === 'resultCard') {
    validateResultPayload(errors, payload, 'feishuProjection.payload');
  }

  return errors;
}

export function isPmsCheckoutProjectionEnvelope(value: JsonRecord): value is PmsCheckoutProjectionEnvelope {
  return validatePmsCheckoutProjectionEnvelope(value).length === 0;
}

export function pmsCheckoutProjectionTargetToDeliveryTarget(target: PmsCheckoutProjectionTarget): DeliveryTarget {
  switch (target.kind) {
    case 'chat':
      return { channel: 'feishu', chatId: target.id };
    case 'open_id':
      return { channel: 'feishu', openId: target.id };
    case 'user':
      return { channel: 'feishu', userId: target.id };
    case 'union_id':
      return { channel: 'feishu', unionId: target.id };
  }
}

export function pmsCheckoutDeliveryTargetToProjectionTarget(target: DeliveryTarget | undefined): PmsCheckoutProjectionTarget | undefined {
  if (!target) {
    return undefined;
  }
  if (target.chatId) {
    return { kind: 'chat', id: target.chatId };
  }
  if (target.openId) {
    return { kind: 'open_id', id: target.openId };
  }
  if (target.userId) {
    return { kind: 'user', id: target.userId };
  }
  if (target.unionId) {
    return { kind: 'union_id', id: target.unionId };
  }
  return undefined;
}

export function toPmsCheckoutDryRunCardInput(envelope: PmsCheckoutProjectionEnvelope): PmsCheckoutDryRunCardInput {
  const projection = envelope.feishuProjection;
  const payload = projection.payload;
  const dryRunIdentity = parseDryRunIdentity(recordField(payload, 'dryRunIdentity'));
  const confirmAction = recordField(payload, 'confirmAction');
  const actor = parseActorRef(recordField(payload, 'actor'));
  const currentStatus = parseStatus(recordField(payload, 'currentStatus'));
  const nextStatus = parseStatus(recordField(payload, 'nextStatus'));

  if (!dryRunIdentity || !confirmAction || !actor || !currentStatus || !nextStatus) {
    throw new Error('Invalid PMS checkout dry-run projection payload');
  }

  return {
    roomId: requiredString(payload, 'roomId'),
    roomNumber: requiredString(payload, 'roomNumber'),
    currentStatus,
    nextStatus,
    taskPreview: requiredString(payload, 'taskPreview'),
    reason: optionalTopLevelReason(envelope) ?? 'PMS checkout dry-run requires human confirmation.',
    actor,
    correlationId: requiredString(payload, 'correlationId'),
    idempotencyKey: requiredString(payload, 'idempotencyKey'),
    requestFingerprint: dryRunIdentity.requestFingerprint,
    dryRunIdentity,
    confirmIdentity: {
      mode: 'confirm',
      idempotencyKey: requiredString(confirmAction, 'idempotencyKey'),
      requestFingerprint: requiredString(confirmAction, 'requestFingerprint'),
      confirmMode: 'confirm'
    },
    requestedAt: stringField(envelope, 'requestedAt') ?? new Date().toISOString(),
    target: pmsCheckoutProjectionTargetToDeliveryTarget(projection.target),
    projectionTarget: projection.target
  };
}

export function toPmsCheckoutResultProjection(envelope: PmsCheckoutProjectionEnvelope): PmsCheckoutResultProjection {
  const payload = envelope.feishuProjection.payload;
  const actor = parseActorRef(recordField(payload, 'actor'));
  if (!actor) {
    throw new Error('Invalid PMS checkout result projection actor');
  }

  const errors = arrayField(payload, 'errors');
  if (errors && errors.length > 0) {
    return {
      ok: false,
      roomId: stringField(payload, 'roomId'),
      roomNumber: stringField(payload, 'roomNumber'),
      errors: parseErrors(errors),
      actor,
      correlationId: requiredString(payload, 'correlationId'),
      idempotencyKey: requiredString(payload, 'idempotencyKey'),
      occurredAt: stringField(envelope, 'requestedAt') ?? new Date().toISOString()
    };
  }

  const previousStatus = parseStatus(recordField(payload, 'currentStatus'));
  const nextStatus = parseStatus(recordField(payload, 'nextStatus'));
  if (!previousStatus || !nextStatus) {
    throw new Error('Invalid PMS checkout result projection status');
  }

  return {
    ok: true,
    roomId: requiredString(payload, 'roomId'),
    roomNumber: requiredString(payload, 'roomNumber'),
    previousStatus,
    nextStatus,
    housekeepingTaskId: stringField(payload, 'housekeepingTaskId') ?? stringField(payload, 'taskId'),
    auditId: requiredString(payload, 'auditId'),
    eventTypes: parseEventTypes(arrayField(payload, 'eventTypes') ?? []),
    actor,
    correlationId: requiredString(payload, 'correlationId'),
    idempotencyKey: requiredString(payload, 'idempotencyKey'),
    occurredAt: stringField(envelope, 'requestedAt') ?? new Date().toISOString()
  };
}

export function hasDistinctDryRunAndConfirmIdentity(
  dryRunIdentity: PmsCheckoutDryRunIdentity,
  confirmIdentity: PmsCheckoutConfirmIdentity
): boolean {
  return (
    dryRunIdentity.idempotencyKey !== confirmIdentity.idempotencyKey &&
    dryRunIdentity.requestFingerprint !== confirmIdentity.requestFingerprint
  );
}

function validateDryRunPayload(errors: string[], payload: JsonRecord, path: string): void {
  requireNonEmptyString(errors, payload.roomId, `${path}.roomId`);
  requireNonEmptyString(errors, payload.roomNumber, `${path}.roomNumber`);
  requireStatus(errors, recordField(payload, 'currentStatus'), `${path}.currentStatus`);
  requireStatus(errors, recordField(payload, 'nextStatus'), `${path}.nextStatus`);
  requireNonEmptyString(errors, payload.taskPreview, `${path}.taskPreview`);
  requireActor(errors, recordField(payload, 'actor'), `${path}.actor`);
  requireNonEmptyString(errors, payload.correlationId, `${path}.correlationId`);
  requireNonEmptyString(errors, payload.idempotencyKey, `${path}.idempotencyKey`);
  requireNonEmptyString(errors, payload.requestFingerprint, `${path}.requestFingerprint`);

  const dryRunIdentity = parseDryRunIdentity(recordField(payload, 'dryRunIdentity'));
  if (!dryRunIdentity) {
    errors.push(`${path}.dryRunIdentity must be a dryRun identity object`);
  }

  const confirmAction = recordField(payload, 'confirmAction');
  if (!confirmAction) {
    errors.push(`${path}.confirmAction must be an object`);
    return;
  }

  if (confirmAction.actionId !== PMS_CHECKOUT_CONFIRM_ACTION_ID) {
    errors.push(`${path}.confirmAction.actionId must be ${PMS_CHECKOUT_CONFIRM_ACTION_ID}`);
  }
  if (confirmAction.confirmMode !== 'confirm') {
    errors.push(`${path}.confirmAction.confirmMode must be confirm`);
  }
  if (confirmAction.callbackEnvelope !== PMS_CHECKOUT_CONFIRM_CALLBACK_ENVELOPE) {
    errors.push(`${path}.confirmAction.callbackEnvelope must be ${PMS_CHECKOUT_CONFIRM_CALLBACK_ENVELOPE}`);
  }
  requireNonEmptyString(errors, confirmAction.idempotencyKey, `${path}.confirmAction.idempotencyKey`);
  requireNonEmptyString(errors, confirmAction.requestFingerprint, `${path}.confirmAction.requestFingerprint`);
  validateForwardTo(errors, recordField(confirmAction, 'forwardTo'), `${path}.confirmAction.forwardTo`, false);

  if (dryRunIdentity && hasNonEmptyString(confirmAction.idempotencyKey) && hasNonEmptyString(confirmAction.requestFingerprint)) {
    const confirmIdentity: PmsCheckoutConfirmIdentity = {
      mode: 'confirm',
      idempotencyKey: confirmAction.idempotencyKey,
      requestFingerprint: confirmAction.requestFingerprint,
      confirmMode: 'confirm'
    };
    if (!hasDistinctDryRunAndConfirmIdentity(dryRunIdentity, confirmIdentity)) {
      errors.push(`${path}.confirmAction identity must differ from dryRunIdentity`);
    }
  }
}

function validateResultPayload(errors: string[], payload: JsonRecord, path: string): void {
  requireNonEmptyString(errors, payload.roomId, `${path}.roomId`);
  requireNonEmptyString(errors, payload.roomNumber, `${path}.roomNumber`);
  requireActor(errors, recordField(payload, 'actor'), `${path}.actor`);
  requireNonEmptyString(errors, payload.correlationId, `${path}.correlationId`);
  requireNonEmptyString(errors, payload.idempotencyKey, `${path}.idempotencyKey`);

  const payloadErrors = arrayField(payload, 'errors');
  if (payloadErrors && payloadErrors.length > 0) {
    for (const [index, error] of payloadErrors.entries()) {
      if (!isRecord(error)) {
        errors.push(`${path}.errors[${index}] must be an object`);
        continue;
      }
      requireNonEmptyString(errors, error.code, `${path}.errors[${index}].code`);
      requireNonEmptyString(errors, error.message, `${path}.errors[${index}].message`);
    }
    return;
  }

  requireStatus(errors, recordField(payload, 'currentStatus'), `${path}.currentStatus`);
  requireStatus(errors, recordField(payload, 'nextStatus'), `${path}.nextStatus`);
  requireNonEmptyString(errors, payload.auditId, `${path}.auditId`);
  const eventTypes = arrayField(payload, 'eventTypes');
  if (!eventTypes || eventTypes.length === 0) {
    errors.push(`${path}.eventTypes must include PMS event types`);
  }
}

function validateProjectionTarget(errors: string[], target: JsonRecord | undefined, path: string): void {
  if (!target) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (target.kind !== 'chat' && target.kind !== 'user' && target.kind !== 'open_id' && target.kind !== 'union_id') {
    errors.push(`${path}.kind must be chat, user, open_id, or union_id`);
  }
  requireNonEmptyString(errors, target.id, `${path}.id`);
}

function validateForwardTo(errors: string[], forwardTo: JsonRecord | undefined, path: string, requireAuth: boolean): void {
  if (!forwardTo) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (forwardTo.owner !== 'ai-pms') {
    errors.push(`${path}.owner must be ai-pms`);
  }
  if (forwardTo.handler !== PMS_CHECKOUT_CONFIRM_CALLBACK_HANDLER) {
    errors.push(`${path}.handler must be ${PMS_CHECKOUT_CONFIRM_CALLBACK_HANDLER}`);
  }
  if (!requireAuth) {
    return;
  }
  const auth = recordField(forwardTo, 'auth');
  if (!auth) {
    errors.push(`${path}.auth must be an object`);
    return;
  }
  if (auth.headerName !== PMS_CHECKOUT_CALLBACK_AUTH_HEADER) {
    errors.push(`${path}.auth.headerName must be ${PMS_CHECKOUT_CALLBACK_AUTH_HEADER}`);
  }
  if (auth.envName !== PMS_CHECKOUT_CALLBACK_AUTH_ENV_NAME) {
    errors.push(`${path}.auth.envName must be ${PMS_CHECKOUT_CALLBACK_AUTH_ENV_NAME}`);
  }
  if (auth.valueStoredInRepo !== false) {
    errors.push(`${path}.auth.valueStoredInRepo must be false`);
  }
}

function requireStatus(errors: string[], status: JsonRecord | undefined, path: string): void {
  if (!status) {
    errors.push(`${path} must be an object`);
    return;
  }
  requireNonEmptyString(errors, status.occupancy, `${path}.occupancy`);
  requireNonEmptyString(errors, status.cleaning, `${path}.cleaning`);
  requireNonEmptyString(errors, status.sale, `${path}.sale`);
}

function requireActor(errors: string[], actor: JsonRecord | undefined, path: string): void {
  if (!actor) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (actor.type !== 'human' && actor.type !== 'ai' && actor.type !== 'system') {
    errors.push(`${path}.type must be human, ai, or system`);
  }
  requireNonEmptyString(errors, actor.id, `${path}.id`);
}

function parseDryRunIdentity(value: JsonRecord | undefined): PmsCheckoutDryRunIdentity | null {
  if (!value || value.mode !== 'dryRun') {
    return null;
  }
  const idempotencyKey = stringField(value, 'idempotencyKey');
  const requestFingerprint = stringField(value, 'requestFingerprint');
  if (!idempotencyKey || !requestFingerprint) {
    return null;
  }
  return { mode: 'dryRun', idempotencyKey, requestFingerprint };
}

function parseConfirmIdentity(value: JsonRecord | undefined): PmsCheckoutConfirmIdentity | null {
  if (!value || value.mode !== 'confirm' || value.confirmMode !== 'confirm') {
    return null;
  }
  const idempotencyKey = stringField(value, 'idempotencyKey');
  const requestFingerprint = stringField(value, 'requestFingerprint');
  if (!idempotencyKey || !requestFingerprint) {
    return null;
  }
  return { mode: 'confirm', idempotencyKey, requestFingerprint, confirmMode: 'confirm' };
}

function parseActorRef(value: JsonRecord | undefined): PmsCheckoutActorRef | null {
  if (!value || (value.type !== 'human' && value.type !== 'ai' && value.type !== 'system')) {
    return null;
  }
  const id = stringField(value, 'id');
  if (!id) {
    return null;
  }
  return {
    type: value.type,
    id,
    displayName: stringField(value, 'displayName')
  };
}

function parseStatus(value: JsonRecord | undefined): PmsRoomStatusProjection | null {
  if (!value) {
    return null;
  }
  const occupancy = stringField(value, 'occupancy');
  const cleaning = stringField(value, 'cleaning');
  const sale = stringField(value, 'sale');
  if (!occupancy || !cleaning || !sale) {
    return null;
  }
  return { occupancy, cleaning, sale };
}

function parseErrors(errors: readonly unknown[]): readonly { readonly code: string; readonly message: string; readonly field?: string }[] {
  return errors.filter(isRecord).map((error) => ({
    code: requiredString(error, 'code'),
    message: requiredString(error, 'message'),
    field: stringField(error, 'field')
  }));
}

function parseEventTypes(values: readonly unknown[]): readonly ('RoomCheckedOut' | 'HousekeepingTaskCreated')[] {
  return values.filter(
    (value): value is 'RoomCheckedOut' | 'HousekeepingTaskCreated' =>
      value === 'RoomCheckedOut' || value === 'HousekeepingTaskCreated'
  );
}

function statusText(status: PmsRoomStatusProjection): string {
  return `${status.occupancy}/${status.cleaning}/${status.sale}`;
}

function actorText(actor: PmsCheckoutActorRef): string {
  return actor.displayName ? `${actor.displayName} (${actor.type}:${actor.id})` : `${actor.type}:${actor.id}`;
}

function identityToRecord(identity: PmsCheckoutDryRunIdentity | PmsCheckoutConfirmIdentity): JsonRecord {
  return { ...identity } as JsonRecord;
}

function optionalTopLevelReason(envelope: JsonRecord): string | undefined {
  return stringField(envelope, 'reason');
}

function requiredString(value: JsonRecord, key: string): string {
  const candidate = stringField(value, key);
  if (!candidate) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return candidate;
}

function stringField(value: JsonRecord, key: string): string | undefined {
  const candidate = value[key];
  return typeof candidate === 'string' && candidate.trim() ? candidate : undefined;
}

function recordField(value: JsonRecord | undefined, key: string): JsonRecord | undefined {
  const candidate = value?.[key];
  return isRecord(candidate) ? candidate : undefined;
}

function arrayField(value: JsonRecord, key: string): readonly unknown[] | undefined {
  const candidate = value[key];
  return Array.isArray(candidate) ? candidate : undefined;
}

function requireNonEmptyString(errors: string[], value: unknown, field: string): void {
  if (!hasNonEmptyString(value)) {
    errors.push(`${field} must be a non-empty string`);
  }
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
