export type IngressMode = 'webhook' | 'long_connection';

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
  state: {
    dedupeTtlSeconds: number;
    pendingTtlSeconds: number;
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

export function loadConfig(env: Record<string, string | undefined> = process.env): AdapterConfig {
  const providerKeys = parseCsv(env, 'ADAPTER_FEISHU_PROVIDER_KEYS', ['warning-agent']);
  const defaultProvider = env.ADAPTER_FEISHU_DEFAULT_PROVIDER?.trim() || providerKeys[0];

  if (defaultProvider && !providerKeys.includes(defaultProvider)) {
    throw new Error('ADAPTER_FEISHU_DEFAULT_PROVIDER must be included in ADAPTER_FEISHU_PROVIDER_KEYS');
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
    state: {
      dedupeTtlSeconds: parsePositiveInteger(env, 'ADAPTER_FEISHU_DEDUPE_TTL_SECONDS', 300),
      pendingTtlSeconds: parsePositiveInteger(env, 'ADAPTER_FEISHU_PENDING_TTL_SECONDS', 900)
    }
  };
}
