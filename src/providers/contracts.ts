import type {
  DeliveryTarget,
  InboundTurn,
  JsonRecord,
  ProviderAlertSubmission,
  ProviderDeliveryResult,
  ProviderKey,
  ProviderNotification
} from '../core/contracts.js';
import type { PendingStore } from '../state/pendingStore.js';

export interface ProviderNotificationSink {
  sendNotification(notification: ProviderNotification): Promise<ProviderDeliveryResult>;
}

export interface ProviderCallbackForwardRequest {
  envelope: JsonRecord;
  metadata?: JsonRecord;
}

export interface ProviderCallbackForwardResult {
  statusCode: number;
  body?: JsonRecord;
}

export interface ProviderCallbackForwarder {
  forwardCallback(request: ProviderCallbackForwardRequest): Promise<ProviderCallbackForwardResult>;
}

export interface ProviderExecutionContext {
  replySink: ProviderNotificationSink;
  defaultTarget?: DeliveryTarget;
  now?: () => string;
  pendingStore?: PendingStore;
  callbackForwarder?: ProviderCallbackForwarder;
}

export type ProviderExecutionStatus = 'accepted' | 'ignored' | 'deferred' | 'failed';

export interface ProviderExecutionResult {
  providerKey: ProviderKey;
  status: ProviderExecutionStatus;
  message?: string;
  rawResponse?: JsonRecord;
  metadata?: JsonRecord;
}

export interface ProviderDefinition<
  TNotificationPayload extends JsonRecord = JsonRecord,
  TAlertSubmission extends ProviderAlertSubmission = ProviderAlertSubmission,
  TCallbackTurn extends InboundTurn = InboundTurn
> {
  providerKey: ProviderKey;
  supportsNotification(payload: JsonRecord): payload is TNotificationPayload;
  deliverNotification(
    payload: TNotificationPayload,
    context: ProviderExecutionContext
  ): Promise<ProviderDeliveryResult>;
  supportsAlertSubmission?(payload: ProviderAlertSubmission): payload is TAlertSubmission;
  submitAlert?(
    payload: TAlertSubmission,
    context: ProviderExecutionContext
  ): Promise<ProviderExecutionResult>;
  handleCallback?(
    payload: TCallbackTurn,
    context: ProviderExecutionContext
  ): Promise<ProviderExecutionResult>;
}

export type AnyProviderDefinition = ProviderDefinition<
  JsonRecord,
  ProviderAlertSubmission,
  InboundTurn
>;
