import type { FeishuUserIdType } from './channels/feishu/bitableClient.js';
import { AI_CONVERSATION_AUTH_ENV_NAME, AI_CONVERSATION_AUTH_HEADER } from './conversation/forwarder.js';

export type IngressMode = 'webhook' | 'long_connection';

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
  state: {
    dedupeTtlSeconds: number;
    pendingTtlSeconds: number;
    pendingStatePath?: string;
  };
  pmsCheckout: {
    callbackUrl?: string;
    inboundTurnUrl?: string;
    callbackToken?: string;
    callbackTokenHeader: 'X-AI-PMS-CALLBACK-TOKEN';
    callbackTokenEnvName: 'AI_PMS_CALLBACK_TOKEN';
    callbackTimeoutMs: number;
    inboundTurnTimeoutMs: number;
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
  const pmsCheckoutCallbackUrl = parseOptionalUrl(env, 'ADAPTER_FEISHU_PMS_CHECKOUT_CALLBACK_URL');
  const pmsCheckoutInboundTurnUrl = parseOptionalUrl(env, 'ADAPTER_FEISHU_PMS_CHECKOUT_INBOUND_TURN_URL');
  const pmsCheckoutCallbackToken = env.AI_PMS_CALLBACK_TOKEN?.trim() || undefined;
  const conversationTurnUrl = parseOptionalUrl(env, 'ADAPTER_FEISHU_CONVERSATION_TURN_URL');
  const conversationInboundAuthToken = env.AI_CONVERSATION_INBOUND_AUTH_TOKEN?.trim() || undefined;
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

  if ((pmsCheckoutCallbackUrl || pmsCheckoutInboundTurnUrl) && !pmsCheckoutCallbackToken) {
    throw new Error(
      'AI_PMS_CALLBACK_TOKEN must be set when ADAPTER_FEISHU_PMS_CHECKOUT_CALLBACK_URL or ADAPTER_FEISHU_PMS_CHECKOUT_INBOUND_TURN_URL is set'
    );
  }

  if (pmsCheckoutInboundTurnUrl && adapterAllowedChatIds.length === 0) {
    throw new Error(
      'ADAPTER_FEISHU_ALLOWED_CHAT_IDS or FEISHU_HOME_CHANNEL must be set when ADAPTER_FEISHU_PMS_CHECKOUT_INBOUND_TURN_URL is set'
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
      registryPath: env.ADAPTER_FEISHU_FORM_REGISTRY_PATH?.trim() || undefined
    },
    state: {
      dedupeTtlSeconds: parsePositiveInteger(env, 'ADAPTER_FEISHU_DEDUPE_TTL_SECONDS', 300),
      pendingTtlSeconds: parsePositiveInteger(env, 'ADAPTER_FEISHU_PENDING_TTL_SECONDS', 900),
      pendingStatePath: env.ADAPTER_FEISHU_PENDING_STATE_PATH?.trim() || undefined
    },
    pmsCheckout: {
      callbackUrl: pmsCheckoutCallbackUrl,
      inboundTurnUrl: pmsCheckoutInboundTurnUrl,
      callbackToken: pmsCheckoutCallbackToken,
      callbackTokenHeader: 'X-AI-PMS-CALLBACK-TOKEN',
      callbackTokenEnvName: 'AI_PMS_CALLBACK_TOKEN',
      callbackTimeoutMs: parsePositiveInteger(env, 'ADAPTER_FEISHU_PMS_CHECKOUT_CALLBACK_TIMEOUT_MS', 5_000),
      inboundTurnTimeoutMs: parsePositiveInteger(env, 'ADAPTER_FEISHU_PMS_CHECKOUT_INBOUND_TURN_TIMEOUT_MS', 5_000),
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
    }
  };
}
