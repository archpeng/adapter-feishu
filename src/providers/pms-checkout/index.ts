import type { DeliveryTarget, InboundActor, InboundTurn, JsonRecord, ProviderNotification } from '../../core/contracts.js';
import type {
  ProviderCallbackForwarder,
  ProviderDefinition,
  ProviderExecutionContext
} from '../contracts.js';
import type { PendingActionRecord } from '../../state/pendingStore.js';
import {
  PMS_CHECKOUT_CONFIRM_ACTION_ID,
  PMS_CHECKOUT_CONFIRM_CALLBACK_HANDLER,
  PMS_CHECKOUT_CONFIRM_CALLBACK_NAME,
  PMS_CHECKOUT_CONFIRM_CALLBACK_VERSION,
  PMS_CHECKOUT_PROVIDER_KEY,
  PMS_PENDING_ACTION_CALLBACK_AUTH_ENV_NAME,
  PMS_PENDING_ACTION_CANCEL_OPERATION,
  PMS_PENDING_ACTION_CONFIRM_OPERATION,
  PMS_PENDING_ACTION_STATUS_OPERATION,
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
  type PmsCheckoutResultProjection,
  type PmsPendingActionCallbackApiRequest,
  type PmsPendingActionOperation
} from './contracts.js';

export interface PmsCheckoutProviderOptions {
  defaultTarget?: DeliveryTarget;
  now?: () => string;
  callbackForwarder?: ProviderCallbackForwarder;
}

export interface PmsCheckoutPlatformPendingActionCallbackForwarderOptions {
  baseUrl: string;
  token: string;
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

export function createPmsCheckoutPlatformPendingActionCallbackForwarder(
  options: PmsCheckoutPlatformPendingActionCallbackForwarderOptions
): ProviderCallbackForwarder {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;

  return {
    async forwardCallback(request) {
      const platformRequest = platformPendingActionRequestFromEnvelope(request.envelope);
      if (!platformRequest) {
        throw new Error('pms_pending_action_callback_payload_required');
      }

      return postPlatformPendingActionCallback({
        baseUrl: options.baseUrl,
        token: options.token,
        timeoutMs,
        fetchImpl,
        operation: platformRequest.operation,
        body: platformRequest.request
      });
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
    title: `退房预演：房间 ${input.roomNumber}`,
    summary: `PMS 建议为房间 ${input.roomNumber} 办理退房。请人工核对后点击确认按钮。`,
    severity: 'info',
    target,
    bodyMarkdown: [
      '**仅 PMS 预演。**',
      '点击确认会由 adapter-feishu 向已配置的 PMS 回调通道发送受控回调；adapter-feishu 不拥有 PMS 退房状态。'
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
      title: `退房失败${result.roomNumber ? `：房间 ${result.roomNumber}` : ''}`,
      summary: 'PMS 拒绝了退房命令，请按关联号排查。',
      severity: 'warning',
      target,
      bodyMarkdown: '飞书仅展示 PMS 结构化反馈；PMS 仍是退房事实来源。',
      facts: [
        ...(result.roomId ? [{ label: '房间ID', value: result.roomId }] : []),
        { label: '错误数量', value: String(result.errors.length) },
        { label: '操作人', value: actorText(result.actor) },
        { label: '关联号', value: result.correlationId },
        { label: '幂等键', value: result.idempotencyKey }
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
    title: `退房完成：房间 ${result.roomNumber}`,
    summary: result.housekeepingTaskId
      ? `PMS 已完成房间 ${result.roomNumber} 退房，并创建保洁任务 ${result.housekeepingTaskId}。`
      : `PMS 已完成房间 ${result.roomNumber} 退房，并记录审计 ${result.auditId}。`,
    severity: 'info',
    target,
    bodyMarkdown: 'PMS 是退房状态的唯一事实来源；此飞书卡片仅展示投影结果。',
    facts: [
      { label: '房间', value: `${result.roomNumber} (${result.roomId})` },
      { label: '原状态', value: statusText(result.previousStatus) },
      { label: '新状态', value: statusText(result.nextStatus) },
      ...(result.housekeepingTaskId ? [{ label: '保洁任务', value: result.housekeepingTaskId }] : []),
      { label: '审计记录', value: result.auditId },
      { label: '事件', value: result.eventTypes.map(eventTypeText).join('、') },
      { label: '操作人', value: actorText(result.actor) },
      { label: '关联号', value: result.correlationId },
      { label: '幂等键', value: result.idempotencyKey }
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
    projectionTarget: projectionTarget ? { ...projectionTarget } : undefined,
    ...(input.pendingAction ? { pendingAction: { ...input.pendingAction, scope: { ...input.pendingAction.scope } } } : {})
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
  const pendingAction = recordField(payload, 'pendingAction');
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

  if (action.pendingAction && pendingAction) {
    const scope = recordField(pendingAction, 'scope');
    if (
      stringField(pendingAction, 'pendingActionRef') !== action.pendingAction.pendingActionRef ||
      stringField(pendingAction, 'cardPayloadRef') !== action.pendingAction.cardPayloadRef ||
      stringField(scope ?? {}, 'propertyId') !== action.pendingAction.scope.propertyId ||
      stringField(scope ?? {}, 'channel') !== action.pendingAction.scope.channel ||
      optionalStringField(scope ?? {}, 'tenantIdHash') !== action.pendingAction.scope.tenantIdHash ||
      optionalStringField(scope ?? {}, 'chatIdHash') !== action.pendingAction.scope.chatIdHash ||
      optionalStringField(scope ?? {}, 'userIdHash') !== action.pendingAction.scope.userIdHash
    ) {
      return 'pending_action_mismatch';
    }
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
  const platformPendingAction = input.action.pendingAction
    ? buildPlatformPendingActionCallback(input.action, actor, input.requestedAt)
    : undefined;

  return ({
    contract: {
      schema: 'https://github.com/archpeng/pms-platform/contracts/schemas/pending-action-callback.schema.json',
      name: 'pms-platform-pending-action-callback',
      version: 'v1',
      owner: 'pms-platform',
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
    ...(platformPendingAction ? { platformPendingAction } : {}),
    orchestrator: {
      toolName: PMS_CHECKOUT_CONFIRM_CALLBACK_HANDLER,
      interaction: 'confirmCallback',
      conversationOwner: 'adapter-feishu',
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
        targetOwner: 'pms-platform',
        handler: PMS_CHECKOUT_CONFIRM_CALLBACK_HANDLER,
        auth: {
          type: 'bearer-token',
          headerName: 'Authorization',
          envName: PMS_PENDING_ACTION_CALLBACK_AUTH_ENV_NAME,
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
          wrapper: 'pms-platform.pending_action.confirm',
          operation: 'pms_check_out',
          mode: 'confirm',
          identity: 'confirmIdentity'
        },
        {
          owner: 'adapter-feishu',
          wrapper: 'adapter-feishu.checkout.project_result',
          providerKey: PMS_CHECKOUT_PROVIDER_KEY,
          projection: 'result-card'
        }
      ],
      rejectionCases: [
        'missing_platform_callback_auth',
        'pending_consumed_or_stale',
        'provider_or_action_mismatch',
        'dry_run_identity_reused_for_confirm',
        'pms_down_after_click'
      ]
    }
  } as unknown) as JsonRecord;
}

function buildPlatformPendingActionCallback(
  action: PmsCheckoutConfirmActionValue,
  actor: PmsCheckoutActorRef,
  requestedAt: string
): JsonRecord {
  if (!action.pendingAction) {
    throw new Error('pms_pending_action_ref_required');
  }
  const request: PmsPendingActionCallbackApiRequest = {
    operation: PMS_PENDING_ACTION_CONFIRM_OPERATION,
    pendingActionRef: action.pendingAction.pendingActionRef,
    actor,
    scope: action.pendingAction.scope,
    clientToken: action.confirmIdentity.idempotencyKey,
    requestFingerprint: action.confirmIdentity.requestFingerprint,
    correlationId: action.correlationId,
    requestedAt,
    ...(action.pendingAction.cardPayloadRef ? { cardPayloadRef: action.pendingAction.cardPayloadRef } : {})
  };
  return ({
    operation: PMS_PENDING_ACTION_CONFIRM_OPERATION,
    request,
    routing: {
      owner: 'pms-platform',
      auth: {
        type: 'bearer-token',
        envName: PMS_PENDING_ACTION_CALLBACK_AUTH_ENV_NAME,
        valueStoredInRepo: false
      },
      endpoints: {
        status: '/v1/pms/pending-actions/status',
        confirm: '/v1/pms/pending-actions/confirm',
        cancel: '/v1/pms/pending-actions/cancel'
      }
    }
  } as unknown) as JsonRecord;
}

async function postPlatformPendingActionCallback(input: {
  readonly baseUrl: string;
  readonly token: string;
  readonly timeoutMs: number;
  readonly fetchImpl: typeof fetch;
  readonly operation: PmsPendingActionOperation;
  readonly body: PmsPendingActionCallbackApiRequest;
}) {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), input.timeoutMs);
  try {
    const response = await input.fetchImpl(platformPendingActionUrl(input.baseUrl, input.operation), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${input.token}`
      },
      body: JSON.stringify(input.body),
      signal: abortController.signal
    });
    const body = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(`pms_pending_action_callback_forward_failed:${response.status}`);
    }
    return {
      statusCode: response.status,
      body
    };
  } finally {
    clearTimeout(timeout);
  }
}

function platformPendingActionUrl(baseUrl: string, operation: PmsPendingActionOperation): string {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  switch (operation) {
    case PMS_PENDING_ACTION_STATUS_OPERATION:
      return `${normalizedBaseUrl}/v1/pms/pending-actions/status`;
    case PMS_PENDING_ACTION_CONFIRM_OPERATION:
      return `${normalizedBaseUrl}/v1/pms/pending-actions/confirm`;
    case PMS_PENDING_ACTION_CANCEL_OPERATION:
      return `${normalizedBaseUrl}/v1/pms/pending-actions/cancel`;
  }
}

function platformPendingActionRequestFromEnvelope(envelope: JsonRecord): {
  readonly operation: PmsPendingActionOperation;
  readonly request: PmsPendingActionCallbackApiRequest;
} | null {
  const platformPendingAction = recordField(envelope, 'platformPendingAction');
  const request = recordField(platformPendingAction, 'request');
  const operation = stringField(platformPendingAction ?? {}, 'operation');
  if (!request || !isPendingActionOperation(operation)) {
    return null;
  }
  return {
    operation,
    request: { ...request, operation } as unknown as PmsPendingActionCallbackApiRequest
  };
}

function isPendingActionOperation(value: string | undefined): value is PmsPendingActionOperation {
  return (
    value === PMS_PENDING_ACTION_STATUS_OPERATION ||
    value === PMS_PENDING_ACTION_CONFIRM_OPERATION ||
    value === PMS_PENDING_ACTION_CANCEL_OPERATION
  );
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
  return `${statusValueText(status.occupancy)}/${statusValueText(status.cleaning)}/${statusValueText(status.sale)}`;
}

function statusValueText(value: string): string {
  const normalized = value.trim().toLowerCase();
  const mapping: Record<string, string> = {
    vacant: '空房',
    dueout: '预离',
    inhouse: '在住',
    occupied: '在住',
    clean: '干净',
    dirty: '脏房',
    cleaning: '清洁中',
    inspection: '待查',
    rework: '返工',
    sellable: '可售',
    stopsell: '停售',
    outoforder: '停用',
  };
  return mapping[normalized] ?? value;
}

function eventTypeText(eventType: string): string {
  const mapping: Record<string, string> = {
    RoomCheckedOut: '房间已退房',
    HousekeepingTaskCreated: '已创建保洁任务',
  };
  return mapping[eventType] ?? eventType;
}

function actorText(actor: { readonly type: string; readonly id: string; readonly displayName?: string }): string {
  const actorType = actor.type === 'human' ? '人员' : actor.type;
  return actor.displayName ? `${actor.displayName} (${actorType}:${actor.id})` : `${actorType}:${actor.id}`;
}

function stringField(value: JsonRecord, key: string): string | undefined {
  const candidate = value[key];
  return typeof candidate === 'string' && candidate.trim() ? candidate : undefined;
}

function optionalStringField(value: JsonRecord, key: string): string | undefined {
  const candidate = value[key];
  return typeof candidate === 'string' ? candidate : undefined;
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
