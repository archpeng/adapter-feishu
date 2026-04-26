import type { DeliveryTarget, InboundActor, InboundTurn, JsonRecord, ProviderNotification } from '../../core/contracts.js';
import type {
  ProviderCallbackForwarder,
  ProviderDefinition,
  ProviderExecutionContext
} from '../contracts.js';
import type { PendingActionRecord } from '../../state/pendingStore.js';
import {
  PMS_CHECKOUT_CALLBACK_AUTH_ENV_NAME,
  PMS_CHECKOUT_CALLBACK_AUTH_HEADER,
  PMS_CHECKOUT_CONFIRM_ACTION_ID,
  PMS_CHECKOUT_CONFIRM_CALLBACK_HANDLER,
  PMS_CHECKOUT_CONFIRM_CALLBACK_NAME,
  PMS_CHECKOUT_CONFIRM_CALLBACK_VERSION,
  PMS_CHECKOUT_PROVIDER_KEY,
  hasDistinctDryRunAndConfirmIdentity,
  isPmsCheckoutProjectionEnvelope,
  parsePmsCheckoutConfirmActionValue,
  pmsCheckoutConfirmAction,
  pmsCheckoutDeliveryTargetToProjectionTarget,
  pmsCheckoutFacts,
  toPmsCheckoutDryRunCardInput,
  toPmsCheckoutResultProjection,
  validatePmsCheckoutProjectionEnvelope,
  type PmsCheckoutActorRef,
  type PmsCheckoutConfirmActionValue,
  type PmsCheckoutDryRunCardInput,
  type PmsCheckoutProjectionEnvelope,
  type PmsCheckoutResultProjection
} from './contracts.js';

export interface PmsCheckoutProviderOptions {
  defaultTarget?: DeliveryTarget;
  now?: () => string;
  callbackForwarder?: ProviderCallbackForwarder;
}

export interface PmsCheckoutHttpCallbackForwarderOptions {
  url: string;
  token: string;
  headerName?: typeof PMS_CHECKOUT_CALLBACK_AUTH_HEADER;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function createPmsCheckoutProvider(
  options: PmsCheckoutProviderOptions = {}
): ProviderDefinition<PmsCheckoutProjectionEnvelope> {
  return {
    providerKey: PMS_CHECKOUT_PROVIDER_KEY,
    supportsNotification(payload): payload is PmsCheckoutProjectionEnvelope {
      return isPmsCheckoutProjectionEnvelope(payload);
    },
    async deliverNotification(payload, context) {
      const projectionKind = payload.feishuProjection.projectionKind;
      if (projectionKind === 'dryRunCard') {
        return deliverDryRunCard(payload, context, options);
      }
      return deliverResultCard(payload, context, options);
    },
    async handleCallback(turn, context) {
      const action = parsePmsCheckoutConfirmActionValue(turn.callback?.value ?? {});
      if (!action) {
        return {
          providerKey: PMS_CHECKOUT_PROVIDER_KEY,
          status: 'failed',
          message: 'invalid_pms_checkout_callback_payload'
        };
      }

      const pendingRecord = context.pendingStore?.get(PMS_CHECKOUT_PROVIDER_KEY, action.pendingId);
      if (!pendingRecord) {
        return {
          providerKey: PMS_CHECKOUT_PROVIDER_KEY,
          status: 'failed',
          message: 'pending_not_found_or_stale'
        };
      }

      const mismatch = pendingActionMismatch(action, pendingRecord);
      if (mismatch) {
        return {
          providerKey: PMS_CHECKOUT_PROVIDER_KEY,
          status: 'failed',
          message: mismatch
        };
      }

      const forwarder = options.callbackForwarder ?? context.callbackForwarder;
      if (!forwarder) {
        throw new Error('pms_checkout_callback_forwarder_required');
      }

      const envelope = buildConfirmCallbackForwardEnvelope({
        action,
        pendingRecord,
        turn,
        requestedAt: turn.receivedAt
      });
      const forwardResult = await forwarder.forwardCallback({
        envelope,
        metadata: {
          providerKey: PMS_CHECKOUT_PROVIDER_KEY,
          pendingId: action.pendingId,
          actionId: action.actionId,
          correlationId: action.correlationId
        }
      });

      return {
        providerKey: PMS_CHECKOUT_PROVIDER_KEY,
        status: 'accepted',
        message: 'pms_checkout_callback_forwarded',
        rawResponse: {
          statusCode: forwardResult.statusCode,
          body: forwardResult.body ?? {}
        },
        metadata: {
          pendingId: action.pendingId,
          actionId: action.actionId,
          correlationId: action.correlationId
        }
      };
    }
  };
}

export function createPmsCheckoutHttpCallbackForwarder(
  options: PmsCheckoutHttpCallbackForwarderOptions
): ProviderCallbackForwarder {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headerName = options.headerName ?? PMS_CHECKOUT_CALLBACK_AUTH_HEADER;
  const timeoutMs = options.timeoutMs ?? 5_000;

  return {
    async forwardCallback(request) {
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), timeoutMs);
      try {
        const response = await fetchImpl(options.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [headerName]: options.token
          },
          body: JSON.stringify(request.envelope),
          signal: abortController.signal
        });
        const body = await parseResponseBody(response);
        if (!response.ok) {
          throw new Error(`pms_checkout_callback_forward_failed:${response.status}`);
        }
        return {
          statusCode: response.status,
          body
        };
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

async function deliverDryRunCard(
  payload: PmsCheckoutProjectionEnvelope,
  context: ProviderExecutionContext,
  options: PmsCheckoutProviderOptions
) {
  const pendingStore = context.pendingStore;
  if (!pendingStore) {
    throw new Error('pms_checkout_pending_store_required');
  }

  const input = toPmsCheckoutDryRunCardInput(payload);
  const target = input.target ?? options.defaultTarget ?? context.defaultTarget;
  const pendingRecord = pendingStore.put({
    providerKey: PMS_CHECKOUT_PROVIDER_KEY,
    actionId: PMS_CHECKOUT_CONFIRM_ACTION_ID,
    payload: buildPendingPayload(input, target),
    target,
    metadata: {
      pendingKind: 'pms-checkout-confirm-action.v1',
      correlationId: input.correlationId,
      roomId: input.roomId,
      dryRunIdempotencyKey: input.dryRunIdentity.idempotencyKey,
      confirmIdempotencyKey: input.confirmIdentity.idempotencyKey
    }
  });

  return context.replySink.sendNotification({
    providerKey: PMS_CHECKOUT_PROVIDER_KEY,
    notificationId: `pms-checkout-dry-run-${input.correlationId}`,
    occurredAt: input.requestedAt,
    title: `Checkout dry-run: room ${input.roomNumber}`,
    summary: `PMS proposes checkout for room ${input.roomNumber}. Confirm only after human review.`,
    severity: 'info',
    target,
    bodyMarkdown: [
      '**PMS preview only.**',
      'Confirming forwards a typed callback to ai-pms/Hermes; adapter-feishu does not own PMS checkout state.'
    ].join('\n'),
    facts: pmsCheckoutFacts(input),
    actions: [pmsCheckoutConfirmAction(input, pendingRecord.pendingId)],
    dedupeKey: `pms-checkout-dry-run:${input.correlationId}:${input.dryRunIdentity.idempotencyKey}`,
    rawPayload: payload,
    metadata: {
      projectionKind: 'dryRunCard',
      pendingId: pendingRecord.pendingId,
      callbackHandler: PMS_CHECKOUT_CONFIRM_CALLBACK_HANDLER
    }
  });
}

async function deliverResultCard(
  payload: PmsCheckoutProjectionEnvelope,
  context: ProviderExecutionContext,
  options: PmsCheckoutProviderOptions
) {
  const result = toPmsCheckoutResultProjection(payload);
  const target =
    pmsCheckoutProjectionTargetToTarget(payload) ?? options.defaultTarget ?? context.defaultTarget;
  return context.replySink.sendNotification(resultToNotification(result, payload, target));
}

function resultToNotification(
  result: PmsCheckoutResultProjection,
  rawPayload: JsonRecord,
  target: DeliveryTarget | undefined
): ProviderNotification {
  if (!result.ok) {
    return {
      providerKey: PMS_CHECKOUT_PROVIDER_KEY,
      notificationId: `pms-checkout-result-${result.correlationId}`,
      occurredAt: result.occurredAt,
      title: `Checkout failed${result.roomNumber ? `: room ${result.roomNumber}` : ''}`,
      summary: result.errors.map((error) => `${error.code}: ${error.message}`).join('\n'),
      severity: 'warning',
      target,
      bodyMarkdown: 'PMS rejected the checkout command. Feishu is showing structured PMS feedback only.',
      facts: [
        ...(result.roomId ? [{ label: 'Room ID', value: result.roomId }] : []),
        { label: 'Actor', value: actorText(result.actor) },
        { label: 'Correlation', value: result.correlationId },
        { label: 'Idempotency', value: result.idempotencyKey }
      ],
      rawPayload,
      metadata: {
        projectionKind: 'resultCard',
        ok: false
      }
    };
  }

  return {
    providerKey: PMS_CHECKOUT_PROVIDER_KEY,
    notificationId: `pms-checkout-result-${result.correlationId}`,
    occurredAt: result.occurredAt,
    title: `Checkout complete: room ${result.roomNumber}`,
    summary: result.housekeepingTaskId
      ? `PMS checked out room ${result.roomNumber} and created housekeeping task ${result.housekeepingTaskId}.`
      : `PMS checked out room ${result.roomNumber} and recorded audit ${result.auditId}.`,
    severity: 'info',
    target,
    bodyMarkdown: 'PMS Core remains the canonical checkout truth; this Feishu card is a projection.',
    facts: [
      { label: 'Room', value: `${result.roomNumber} (${result.roomId})` },
      { label: 'Previous status', value: statusText(result.previousStatus) },
      { label: 'Next status', value: statusText(result.nextStatus) },
      ...(result.housekeepingTaskId ? [{ label: 'Task', value: result.housekeepingTaskId }] : []),
      { label: 'Audit', value: result.auditId },
      { label: 'Events', value: result.eventTypes.join(', ') },
      { label: 'Actor', value: actorText(result.actor) },
      { label: 'Correlation', value: result.correlationId },
      { label: 'Idempotency', value: result.idempotencyKey }
    ],
    rawPayload,
    metadata: {
      projectionKind: 'resultCard',
      ok: true,
      auditId: result.auditId,
      eventTypes: [...result.eventTypes]
    }
  };
}

function pmsCheckoutProjectionTargetToTarget(payload: PmsCheckoutProjectionEnvelope): DeliveryTarget | undefined {
  return payload.feishuProjection.target
    ? importTarget(payload.feishuProjection.target)
    : undefined;
}

function importTarget(target: PmsCheckoutProjectionEnvelope['feishuProjection']['target']): DeliveryTarget {
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

function buildPendingPayload(input: PmsCheckoutDryRunCardInput, target: DeliveryTarget | undefined): JsonRecord {
  const projectionTarget = input.projectionTarget ?? pmsCheckoutDeliveryTargetToProjectionTarget(target);
  return {
    pendingKind: 'pms-checkout-confirm-action.v1',
    providerKey: PMS_CHECKOUT_PROVIDER_KEY,
    actionId: PMS_CHECKOUT_CONFIRM_ACTION_ID,
    roomId: input.roomId,
    roomNumber: input.roomNumber,
    correlationId: input.correlationId,
    dryRunIdentity: { ...input.dryRunIdentity },
    confirmIdentity: { ...input.confirmIdentity },
    actor: { ...input.actor },
    projectionTarget: projectionTarget ? { ...projectionTarget } : undefined
  } as JsonRecord;
}

function pendingActionMismatch(
  action: PmsCheckoutConfirmActionValue,
  pendingRecord: PendingActionRecord
): string | null {
  const payload = pendingRecord.payload;
  if (pendingRecord.actionId !== action.actionId) {
    return 'action_mismatch';
  }
  if (stringField(payload, 'providerKey') !== PMS_CHECKOUT_PROVIDER_KEY) {
    return 'provider_mismatch';
  }
  if (stringField(payload, 'roomId') !== action.roomId) {
    return 'room_mismatch';
  }
  if (stringField(payload, 'correlationId') !== action.correlationId) {
    return 'correlation_mismatch';
  }

  const dryRunIdentity = recordField(payload, 'dryRunIdentity');
  const confirmIdentity = recordField(payload, 'confirmIdentity');
  if (
    !dryRunIdentity ||
    !confirmIdentity ||
    dryRunIdentity.idempotencyKey !== action.dryRunIdentity.idempotencyKey ||
    dryRunIdentity.requestFingerprint !== action.dryRunIdentity.requestFingerprint ||
    confirmIdentity.idempotencyKey !== action.confirmIdentity.idempotencyKey ||
    confirmIdentity.requestFingerprint !== action.confirmIdentity.requestFingerprint ||
    !hasDistinctDryRunAndConfirmIdentity(action.dryRunIdentity, action.confirmIdentity)
  ) {
    return 'identity_mismatch';
  }

  return null;
}

function buildConfirmCallbackForwardEnvelope(input: {
  action: PmsCheckoutConfirmActionValue;
  pendingRecord: PendingActionRecord;
  turn: InboundTurn;
  requestedAt: string;
}): JsonRecord {
  const pendingPayload = input.pendingRecord.payload;
  const pendingActor = actorFromRecord(recordField(pendingPayload, 'actor'));
  const actor = actorFromInbound(input.turn.actor) ?? pendingActor ?? { type: 'human', id: 'unknown-feishu-actor' };
  const projectionTarget =
    projectionTargetFromRecord(recordField(pendingPayload, 'projectionTarget')) ??
    pmsCheckoutDeliveryTargetToProjectionTarget(input.pendingRecord.target) ??
    pmsCheckoutDeliveryTargetToProjectionTarget(input.turn.target);
  const roomNumber = stringField(pendingPayload, 'roomNumber');
  const pendingRef = `provider:${PMS_CHECKOUT_PROVIDER_KEY}/pending:${input.action.pendingId}/action:${PMS_CHECKOUT_CONFIRM_ACTION_ID}`;

  return ({
    contract: {
      schema: 'https://github.com/archpeng/ai-pms/contracts/schemas/pms-checkout-orchestrator.schema.json',
      name: 'pms-checkout-orchestrator',
      version: 'v1',
      owner: 'ai-pms',
      status: 'adapter-runtime-forward'
    },
    actor,
    source: 'adapter-feishu',
    reason: 'adapter-feishu validated and consumed a PMS checkout confirmation card action.',
    correlationId: input.action.correlationId,
    idempotencyKey: input.action.confirmIdentity.idempotencyKey,
    requestedAt: input.requestedAt,
    causality: {
      rootCorrelationId: input.action.correlationId,
      causedBy: {
        kind: 'feishu_callback',
        ref: pendingRef
      },
      upstreamEventIds: [`feishu-card-action-${input.action.pendingId}`],
      domainEventIds: [],
      rawRefs: []
    },
    orchestrator: {
      toolName: PMS_CHECKOUT_CONFIRM_CALLBACK_HANDLER,
      interaction: 'confirmCallback',
      conversationOwner: 'hermes',
      roomId: input.action.roomId,
      ...(roomNumber ? { roomNumber } : {}),
      ...(projectionTarget ? { target: projectionTarget } : {}),
      pendingId: input.action.pendingId,
      dryRunIdentity: {
        ...input.action.dryRunIdentity,
        idempotencyScope: 'checkout-dry-run-preview',
        requestFingerprintScope: 'checkout-dry-run-preview'
      },
      confirmIdentity: {
        ...input.action.confirmIdentity,
        idempotencyScope: 'checkout-confirm-command',
        requestFingerprintScope: 'checkout-confirm-command'
      },
      callbackForwardingEnvelope: {
        name: PMS_CHECKOUT_CONFIRM_CALLBACK_NAME,
        version: PMS_CHECKOUT_CONFIRM_CALLBACK_VERSION,
        providerKey: PMS_CHECKOUT_PROVIDER_KEY,
        pendingId: input.action.pendingId,
        actionId: PMS_CHECKOUT_CONFIRM_ACTION_ID,
        sourceOwner: 'adapter-feishu',
        targetOwner: 'ai-pms',
        handler: PMS_CHECKOUT_CONFIRM_CALLBACK_HANDLER,
        auth: {
          type: 'shared-secret-header',
          headerName: PMS_CHECKOUT_CALLBACK_AUTH_HEADER,
          envName: PMS_CHECKOUT_CALLBACK_AUTH_ENV_NAME,
          valueStoredInRepo: false
        },
        mapsTo: {
          owner: 'pms-platform',
          operation: 'pms_check_out',
          mode: 'confirm'
        }
      },
      calls: [
        {
          owner: 'pms-platform',
          wrapper: 'ai_pms.pms.checkout.confirm',
          operation: 'pms_check_out',
          mode: 'confirm',
          identity: 'confirmIdentity'
        },
        {
          owner: 'adapter-feishu',
          wrapper: 'ai_pms.feishu.checkout.project_result',
          providerKey: PMS_CHECKOUT_PROVIDER_KEY,
          projection: 'result-card'
        }
      ],
      rejectionCases: [
        'missing_callback_auth',
        'pending_consumed_or_stale',
        'provider_or_action_mismatch',
        'dry_run_identity_reused_for_confirm',
        'pms_down_after_click'
      ]
    }
  } as unknown) as JsonRecord;
}

async function parseResponseBody(response: Response): Promise<JsonRecord> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : { raw: text };
  } catch {
    return { raw: text };
  }
}

function actorFromInbound(actor: InboundActor | undefined): PmsCheckoutActorRef | undefined {
  if (!actor) {
    return undefined;
  }
  const id = actor.userId ?? actor.openId ?? actor.tenantKey;
  if (!id) {
    return undefined;
  }
  return {
    type: 'human',
    id,
    displayName: actor.displayName
  };
}

function actorFromRecord(actor: JsonRecord | undefined): PmsCheckoutActorRef | undefined {
  if (!actor || (actor.type !== 'human' && actor.type !== 'ai' && actor.type !== 'system')) {
    return undefined;
  }
  const id = stringField(actor, 'id');
  if (!id) {
    return undefined;
  }
  return {
    type: actor.type,
    id,
    displayName: stringField(actor, 'displayName')
  };
}

function projectionTargetFromRecord(value: JsonRecord | undefined) {
  const kind = stringField(value ?? {}, 'kind');
  const id = stringField(value ?? {}, 'id');
  if (!id || (kind !== 'chat' && kind !== 'user' && kind !== 'open_id' && kind !== 'union_id')) {
    return undefined;
  }
  return { kind, id };
}

function statusText(status: { readonly occupancy: string; readonly cleaning: string; readonly sale: string }): string {
  return `${status.occupancy}/${status.cleaning}/${status.sale}`;
}

function actorText(actor: { readonly type: string; readonly id: string; readonly displayName?: string }): string {
  return actor.displayName ? `${actor.displayName} (${actor.type}:${actor.id})` : `${actor.type}:${actor.id}`;
}

function stringField(value: JsonRecord, key: string): string | undefined {
  const candidate = value[key];
  return typeof candidate === 'string' && candidate.trim() ? candidate : undefined;
}

function recordField(value: JsonRecord | undefined, key: string): JsonRecord | undefined {
  const candidate = value?.[key];
  return isRecord(candidate) ? candidate : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export * from './contracts.js';
export * from './cards.js';
