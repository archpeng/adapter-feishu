import type { InboundTurn, JsonRecord } from '../../core/contracts.js';
import type { ProviderCallbackForwarder, ProviderExecutionResult } from '../../providers/contracts.js';
import type { PendingActionRecord } from '../../state/pendingStore.js';
import {
  PMS_AGENT_PENDING_ACTION_ID,
  PMS_AGENT_PENDING_ACTION_PROVIDER_KEY
} from '../contracts.js';
import {
  actorFromTurn,
  failed,
  operationFromCallback,
  pendingActionFromRecord,
  pendingActionScope,
  PMS_AGENT_CANCEL_OPERATION,
  recordField,
  stringField
} from './shared.js';

export async function handlePmsAgentPendingAction(input: {
  readonly turn: InboundTurn;
  readonly pendingRecord: PendingActionRecord;
  readonly callbackForwarder?: ProviderCallbackForwarder;
}): Promise<ProviderExecutionResult> {
  const operation = operationFromCallback(input.turn.callback?.value ?? {});
  if (!operation) return failed('invalid_pms_agent_pending_action');
  if (!input.callbackForwarder) return failed('pms_agent_pending_action_callback_forwarder_required');
  const pendingAction = pendingActionFromRecord(recordField(input.pendingRecord.payload, 'pendingAction'));
  if (!pendingAction) return failed('missing_pms_agent_pending_action_ref');

  const correlationId = stringField(input.turn.callback?.value, 'correlationId')
    ?? stringField(input.pendingRecord.payload, 'correlationId')
    ?? `pms-agent:${input.pendingRecord.pendingId}`;
  const request: JsonRecord = {
    operation,
    pendingActionRef: pendingAction.pendingActionRef,
    actor: actorFromTurn(input.turn),
    scope: pendingActionScope(input.turn, input.pendingRecord.target, pendingAction.propertyId),
    clientToken: `${operation}:${input.pendingRecord.pendingId}`,
    requestFingerprint: `fingerprint:${operation}:${input.pendingRecord.pendingId}`,
    correlationId,
    requestedAt: input.turn.receivedAt,
    ...(pendingAction.cardPayloadRef ? { cardPayloadRef: pendingAction.cardPayloadRef } : {}),
    ...(operation === PMS_AGENT_CANCEL_OPERATION ? { reason: '用户点击飞书 PMS approval card 取消按钮。' } : {})
  };

  const forwardResult = await input.callbackForwarder.forwardCallback({
    envelope: {
      contract: {
        name: 'pms-platform-pending-action-callback',
        version: 'v1',
        owner: 'pms-platform',
        status: 'adapter-runtime-forward'
      },
      source: 'adapter-feishu',
      reason: 'adapter-feishu validated a PMS Agent approval-card action.',
      correlationId,
      requestedAt: input.turn.receivedAt,
      platformPendingAction: {
        operation,
        request,
        routing: {
          owner: 'pms-platform',
          endpoints: {
            confirm: '/v1/pms/pending-actions/confirm',
            cancel: '/v1/pms/pending-actions/cancel',
            status: '/v1/pms/pending-actions/status'
          }
        }
      },
      orchestrator: {
        providerKey: PMS_AGENT_PENDING_ACTION_PROVIDER_KEY,
        pendingId: input.pendingRecord.pendingId,
        actionId: PMS_AGENT_PENDING_ACTION_ID,
        callbackOwner: 'adapter-feishu',
        targetOwner: 'pms-platform',
        naturalLanguageConfirmAllowed: false
      }
    },
    metadata: {
      providerKey: PMS_AGENT_PENDING_ACTION_PROVIDER_KEY,
      pendingId: input.pendingRecord.pendingId,
      actionId: PMS_AGENT_PENDING_ACTION_ID,
      operation,
      rawRefsLogged: false
    }
  });

  const body = forwardResult.body ?? {};
  if (body.ok === false) {
    return failed('pms_agent_pending_action_callback_rejected');
  }

  return {
    providerKey: PMS_AGENT_PENDING_ACTION_PROVIDER_KEY,
    status: 'accepted',
    message: 'pms_agent_pending_action_callback_forwarded',
    rawResponse: {
      statusCode: forwardResult.statusCode,
      body: forwardResult.body ?? {}
    },
    metadata: {
      pendingId: input.pendingRecord.pendingId,
      actionId: PMS_AGENT_PENDING_ACTION_ID,
      operation,
      correlationId
    }
  };
}
