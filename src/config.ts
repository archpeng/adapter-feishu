import type { FeishuUserIdType } from './channels/feishu/bitableClient.js';
import { AI_CONVERSATION_AUTH_ENV_NAME, AI_CONVERSATION_AUTH_HEADER } from './conversation/forwarder.js';
import { PMS_AGENT_AUTH_ENV_NAME, PMS_AGENT_AUTH_HEADER, PMS_AGENT_TURN_URL_ENV_NAME } from './pmsAgent/contracts.js';

export type IngressMode = 'webhook' | 'long_connection';
export type PmsPendingActionCallbackMode = 'platform';

export interface FeishuFormDefaultTargetConfig {
  appToken: string;
  tableId: string;
  formId?: string;
}

export interface AdapterConfig {
  service: {
    host: string;
    port: number;
    publicBaseUrl?: string;
  };
  feishu: {
    appId: string;
    appSecret: string;
    ingressMode: IngressMode;
    verificationToken?: string;
    webhookSecret?: string;
    encryptKey?: string;
  };
  providers: {
    keys: string[];
    defaultProvider?: string;
    allowProviderOverride: boolean;
    webhookAuthToken?: string;
  };
  form: {
    webhookAuthToken?: string;
    allowTargetOverride: boolean;
    userIdType: FeishuUserIdType;
    defaultTarget?: FeishuFormDefaultTargetConfig;
    registryPath?: string;
  };
  pmsBase: {
    webhookAuthToken?: string;
    registryPath?: string;
  };
  state: {
    dedupeTtlSeconds: number;
    pendingTtlSeconds: number;
    pendingStatePath?: string;
  };
  pmsCheckout: {
    callbackTimeoutMs: number;
    pendingActionCallbackMode: PmsPendingActionCallbackMode;
    pendingActionBaseUrl?: string;
    pendingActionToken?: string;
    pendingActionTokenEnvName?: 'PMS_PLATFORM_PENDING_ACTION_TOKEN';
    pendingActionTimeoutMs?: number;
    allowedChatIds: string[];
    allowedOpenIds: string[];
    allowedUserIds: string[];
    allowedUnionIds: string[];
  };
  conversation: {
    turnUrl?: string;
    inboundAuthToken?: string;
    inboundAuthHeader: typeof AI_CONVERSATION_AUTH_HEADER;
    inboundAuthEnvName: typeof AI_CONVERSATION_AUTH_ENV_NAME;
    turnTimeoutMs: number;
    allowedChatIds: string[];
    allowedOpenIds: string[];
    allowedUserIds: string[];
    allowedUnionIds: string[];
  };
  pmsAgent: {
    turnUrl?: string;
    authToken?: string;
    authHeader: typeof PMS_AGENT_AUTH_HEADER;
    authEnvName: typeof PMS_AGENT_AUTH_ENV_NAME;
    turnUrlEnvName: typeof PMS_AGENT_TURN_URL_ENV_NAME;
    turnTimeoutMs: number;
    allowedChatIds: string[];
    allowedOpenIds: string[];
    allowedUserIds: string[];
    allowedUnionIds: string[];
  };
}

function required(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parsePositiveInteger(
  env: Record<string, string | undefined>,
  key: string,
  defaultValue: number
): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') {
    return defaultValue;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return parsed;
}

function parseIngressMode(env: Record<string, string | undefined>): IngressMode {
  const raw = env.FEISHU_INGRESS_MODE?.trim();
  if (!raw) {
    return 'webhook';
  }
  if (raw === 'webhook' || raw === 'long_connection') {
    return raw;
  }
  throw new Error('FEISHU_INGRESS_MODE must be webhook or long_connection');
}

function parsePmsPendingActionCallbackMode(
  env: Record<string, string | undefined>
): PmsPendingActionCallbackMode {
  const raw = env.ADAPTER_FEISHU_PMS_PENDING_ACTION_CALLBACK_MODE?.trim();
  if (!raw || raw === 'platform') {
    return 'platform';
  }
  throw new Error('ADAPTER_FEISHU_PMS_PENDING_ACTION_CALLBACK_MODE must be platform');
}

function parseCsv(env: Record<string, string | undefined>, key: string, fallback: string[]): string[] {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const values = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw new Error(`${key} must contain at least one provider key`);
  }

  return values;
}

function parseBoolean(env: Record<string, string | undefined>, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  throw new Error(`${key} must be true or false`);
}

function parseFeishuUserIdType(
  env: Record<string, string | undefined>,
  key: string,
  fallback: FeishuUserIdType
): FeishuUserIdType {
  const raw = env[key]?.trim();
  if (!raw) {
    return fallback;
  }
  if (raw === 'user_id' || raw === 'union_id' || raw === 'open_id') {
    return raw;
  }
  throw new Error(`${key} must be user_id, union_id, or open_id`);
}

function parseOptionalUrl(env: Record<string, string | undefined>, key: string): string | undefined {
  const raw = env[key]?.trim();
  if (!raw) {
    return undefined;
  }

  try {
    return new URL(raw).toString();
  } catch {
    throw new Error(`${key} must be an absolute URL`);
  }
}

function parseOptionalFormDefaultTarget(
  env: Record<string, string | undefined>
): FeishuFormDefaultTargetConfig | undefined {
  const appToken = env.ADAPTER_FEISHU_FORM_DEFAULT_APP_TOKEN?.trim();
  const tableId = env.ADAPTER_FEISHU_FORM_DEFAULT_TABLE_ID?.trim();
  const formId = env.ADAPTER_FEISHU_FORM_DEFAULT_FORM_ID?.trim();
  const hasAnyValue = Boolean(appToken || tableId || formId);

  if (!hasAnyValue) {
    return undefined;
  }

  if (!appToken || !tableId) {
    throw new Error(
      'ADAPTER_FEISHU_FORM_DEFAULT_APP_TOKEN and ADAPTER_FEISHU_FORM_DEFAULT_TABLE_ID must be set together'
    );
  }

  return {
    appToken,
    tableId,
    formId: formId || undefined
  };
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AdapterConfig {
  const providerKeys = parseCsv(env, 'ADAPTER_FEISHU_PROVIDER_KEYS', ['warning-agent']);
  const defaultProvider = env.ADAPTER_FEISHU_DEFAULT_PROVIDER?.trim() || providerKeys[0];
  const pmsPendingActionCallbackMode = parsePmsPendingActionCallbackMode(env);
  const pmsPendingActionBaseUrl = parseOptionalUrl(env, 'PMS_PLATFORM_PENDING_ACTION_BASE_URL');
  const pmsPendingActionToken = env.PMS_PLATFORM_PENDING_ACTION_TOKEN?.trim() || undefined;
  const conversationTurnUrl = parseOptionalUrl(env, 'ADAPTER_FEISHU_CONVERSATION_TURN_URL');
  const conversationInboundAuthToken = env.AI_CONVERSATION_INBOUND_AUTH_TOKEN?.trim() || undefined;
  const pmsAgentTurnUrl = parseOptionalUrl(env, PMS_AGENT_TURN_URL_ENV_NAME);
  const pmsAgentAuthToken = env.PMS_AGENT_AUTH_TOKEN?.trim() || undefined;
  const adapterAllowedChatIds = parseCsv(
    env,
    'ADAPTER_FEISHU_ALLOWED_CHAT_IDS',
    env.FEISHU_HOME_CHANNEL?.trim() ? [env.FEISHU_HOME_CHANNEL.trim()] : []
  );
  const adapterAllowedOpenIds = parseCsv(env, 'ADAPTER_FEISHU_ALLOWED_OPEN_IDS', []);
  const adapterAllowedUserIds = parseCsv(env, 'ADAPTER_FEISHU_ALLOWED_USER_IDS', []);
  const adapterAllowedUnionIds = parseCsv(env, 'ADAPTER_FEISHU_ALLOWED_UNION_IDS', []);

  if (defaultProvider && !providerKeys.includes(defaultProvider)) {
    throw new Error('ADAPTER_FEISHU_DEFAULT_PROVIDER must be included in ADAPTER_FEISHU_PROVIDER_KEYS');
  }

  if (!pmsPendingActionBaseUrl || !pmsPendingActionToken) {
    throw new Error(
      'PMS_PLATFORM_PENDING_ACTION_BASE_URL and PMS_PLATFORM_PENDING_ACTION_TOKEN must be set for PMS typed-card callbacks'
    );
  }

  if (conversationTurnUrl && !conversationInboundAuthToken) {
    throw new Error('AI_CONVERSATION_INBOUND_AUTH_TOKEN must be set when ADAPTER_FEISHU_CONVERSATION_TURN_URL is set');
  }

  if (conversationTurnUrl && adapterAllowedChatIds.length === 0) {
    throw new Error(
      'ADAPTER_FEISHU_ALLOWED_CHAT_IDS or FEISHU_HOME_CHANNEL must be set when ADAPTER_FEISHU_CONVERSATION_TURN_URL is set'
    );
  }

  if (pmsAgentTurnUrl && !pmsAgentAuthToken) {
    throw new Error('PMS_AGENT_AUTH_TOKEN must be set when PMS_AGENT_TURN_URL is set');
  }

  if (pmsAgentTurnUrl && adapterAllowedChatIds.length === 0) {
    throw new Error(
      'ADAPTER_FEISHU_ALLOWED_CHAT_IDS or FEISHU_HOME_CHANNEL must be set when PMS_AGENT_TURN_URL is set'
    );
  }

  return {
    service: {
      host: env.ADAPTER_FEISHU_HOST?.trim() || '0.0.0.0',
      port: parsePositiveInteger(env, 'ADAPTER_FEISHU_PORT', 8787),
      publicBaseUrl: env.ADAPTER_FEISHU_PUBLIC_BASE_URL?.trim() || undefined
    },
    feishu: {
      appId: required(env, 'FEISHU_APP_ID'),
      appSecret: required(env, 'FEISHU_APP_SECRET'),
      ingressMode: parseIngressMode(env),
      verificationToken: env.FEISHU_WEBHOOK_VERIFICATION_TOKEN?.trim() || undefined,
      webhookSecret: env.FEISHU_WEBHOOK_SECRET?.trim() || undefined,
      encryptKey: env.FEISHU_ENCRYPT_KEY?.trim() || undefined
    },
    providers: {
      keys: providerKeys,
      defaultProvider,
      allowProviderOverride: parseBoolean(env, 'ADAPTER_FEISHU_ALLOW_PROVIDER_OVERRIDE', false),
      webhookAuthToken: env.ADAPTER_FEISHU_PROVIDER_WEBHOOK_AUTH_TOKEN?.trim() || undefined
    },
    form: {
      webhookAuthToken: env.ADAPTER_FEISHU_FORM_WEBHOOK_AUTH_TOKEN?.trim() || undefined,
      allowTargetOverride: parseBoolean(env, 'ADAPTER_FEISHU_FORM_ALLOW_TARGET_OVERRIDE', false),
      userIdType: parseFeishuUserIdType(env, 'ADAPTER_FEISHU_FORM_USER_ID_TYPE', 'user_id'),
      defaultTarget: parseOptionalFormDefaultTarget(env),
      registryPath: env.ADAPTER_FEISHU_FORM_REGISTRY_PATH?.trim() || undefined,
    },
    pmsBase: {
      webhookAuthToken: env.ADAPTER_FEISHU_PMS_BASE_WEBHOOK_AUTH_TOKEN?.trim() || undefined,
      registryPath: env.ADAPTER_FEISHU_PMS_BASE_REGISTRY_PATH?.trim() || undefined
    },
    state: {
      dedupeTtlSeconds: parsePositiveInteger(env, 'ADAPTER_FEISHU_DEDUPE_TTL_SECONDS', 300),
      pendingTtlSeconds: parsePositiveInteger(env, 'ADAPTER_FEISHU_PENDING_TTL_SECONDS', 900),
      pendingStatePath: env.ADAPTER_FEISHU_PENDING_STATE_PATH?.trim() || undefined
    },
    pmsCheckout: {
      callbackTimeoutMs: parsePositiveInteger(env, 'ADAPTER_FEISHU_PMS_CHECKOUT_CALLBACK_TIMEOUT_MS', 5_000),
      pendingActionCallbackMode: pmsPendingActionCallbackMode,
      pendingActionBaseUrl: pmsPendingActionBaseUrl,
      pendingActionToken: pmsPendingActionToken,
      pendingActionTokenEnvName: 'PMS_PLATFORM_PENDING_ACTION_TOKEN',
      pendingActionTimeoutMs: parsePositiveInteger(env, 'ADAPTER_FEISHU_PMS_PENDING_ACTION_CALLBACK_TIMEOUT_MS', 5_000),
      allowedChatIds: adapterAllowedChatIds,
      allowedOpenIds: adapterAllowedOpenIds,
      allowedUserIds: adapterAllowedUserIds,
      allowedUnionIds: adapterAllowedUnionIds
    },
    conversation: {
      turnUrl: conversationTurnUrl,
      inboundAuthToken: conversationInboundAuthToken,
      inboundAuthHeader: AI_CONVERSATION_AUTH_HEADER,
      inboundAuthEnvName: AI_CONVERSATION_AUTH_ENV_NAME,
      turnTimeoutMs: parsePositiveInteger(env, 'ADAPTER_FEISHU_CONVERSATION_TURN_TIMEOUT_MS', 5_000),
      allowedChatIds: adapterAllowedChatIds,
      allowedOpenIds: adapterAllowedOpenIds,
      allowedUserIds: adapterAllowedUserIds,
      allowedUnionIds: adapterAllowedUnionIds
    },
    pmsAgent: {
      turnUrl: pmsAgentTurnUrl,
      authToken: pmsAgentAuthToken,
      authHeader: PMS_AGENT_AUTH_HEADER,
      authEnvName: PMS_AGENT_AUTH_ENV_NAME,
      turnUrlEnvName: PMS_AGENT_TURN_URL_ENV_NAME,
      turnTimeoutMs: parsePositiveInteger(env, 'PMS_AGENT_TURN_TIMEOUT_MS', 5_000),
      allowedChatIds: adapterAllowedChatIds,
      allowedOpenIds: adapterAllowedOpenIds,
      allowedUserIds: adapterAllowedUserIds,
      allowedUnionIds: adapterAllowedUnionIds
    }
  };
}
