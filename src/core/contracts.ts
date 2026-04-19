export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonRecord = { [key: string]: JsonValue };

export type DeliveryChannel = 'feishu';
export type ProviderKey = string;

export type TurnIntent = 'notify' | 'alert' | 'callback' | 'command';
export type NotificationSeverity = 'info' | 'warning' | 'critical';
export type DeliveryStatus = 'accepted' | 'delivered' | 'deferred' | 'ignored' | 'failed';

export interface DeliveryTarget {
  channel: DeliveryChannel;
  chatId?: string;
  openId?: string;
  messageId?: string;
  threadId?: string;
}

export interface InboundActor {
  userId?: string;
  openId?: string;
  tenantKey?: string;
  displayName?: string;
}

export interface InboundCallback {
  actionId: string;
  actionLabel?: string;
  value?: JsonRecord;
}

export interface InboundTurn {
  turnId: string;
  channel: DeliveryChannel;
  intent: TurnIntent;
  receivedAt: string;
  providerKey?: ProviderKey;
  actor?: InboundActor;
  target: DeliveryTarget;
  text?: string;
  callback?: InboundCallback;
  rawEvent: JsonRecord;
  metadata?: JsonRecord;
}

export interface ProviderFact {
  label: string;
  value: string;
}

export interface ProviderAction {
  actionId: string;
  label: string;
  style?: 'default' | 'primary' | 'danger';
  payload?: JsonRecord;
}

export interface ProviderNotification {
  providerKey: ProviderKey;
  notificationId: string;
  occurredAt: string;
  title: string;
  summary: string;
  severity?: NotificationSeverity;
  target?: DeliveryTarget;
  bodyMarkdown?: string;
  facts?: ProviderFact[];
  actions?: ProviderAction[];
  dedupeKey?: string;
  rawPayload: JsonRecord;
  metadata?: JsonRecord;
}

export interface ProviderAlertSubmission {
  providerKey: ProviderKey;
  submissionId: string;
  sourceSystem: string;
  occurredAt: string;
  title: string;
  summary: string;
  dedupeKey?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  target?: DeliveryTarget;
  rawPayload: JsonRecord;
  metadata?: JsonRecord;
}

export interface ProviderDeliveryResult {
  providerKey: ProviderKey;
  deliveryId: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  deliveredAt?: string;
  target?: DeliveryTarget;
  externalRef?: string;
  dedupeKey?: string;
  message?: string;
  rawResponse?: JsonRecord;
}
