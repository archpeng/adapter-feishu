import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('loads the standalone scaffold defaults', () => {
    const config = loadConfig({
      FEISHU_APP_ID: 'cli_test',
      FEISHU_APP_SECRET: 'secret_test'
    });

    expect(config.service).toEqual({
      host: '0.0.0.0',
      port: 8787,
      publicBaseUrl: undefined
    });
    expect(config.feishu).toEqual({
      appId: 'cli_test',
      appSecret: 'secret_test',
      ingressMode: 'webhook',
      verificationToken: undefined,
      webhookSecret: undefined,
      encryptKey: undefined
    });
    expect(config.providers).toEqual({
      keys: ['warning-agent'],
      defaultProvider: 'warning-agent',
      allowProviderOverride: false
    });
    expect(config.state).toEqual({
      dedupeTtlSeconds: 300,
      pendingTtlSeconds: 900
    });
  });

  it('supports long_connection and explicit provider registration', () => {
    const config = loadConfig({
      FEISHU_APP_ID: 'cli_test',
      FEISHU_APP_SECRET: 'secret_test',
      FEISHU_INGRESS_MODE: 'long_connection',
      ADAPTER_FEISHU_PROVIDER_KEYS: 'warning-agent, incident-bot',
      ADAPTER_FEISHU_DEFAULT_PROVIDER: 'incident-bot',
      ADAPTER_FEISHU_ALLOW_PROVIDER_OVERRIDE: 'true',
      ADAPTER_FEISHU_DEDUPE_TTL_SECONDS: '60',
      ADAPTER_FEISHU_PENDING_TTL_SECONDS: '180'
    });

    expect(config.feishu.ingressMode).toBe('long_connection');
    expect(config.providers).toEqual({
      keys: ['warning-agent', 'incident-bot'],
      defaultProvider: 'incident-bot',
      allowProviderOverride: true
    });
    expect(config.state).toEqual({
      dedupeTtlSeconds: 60,
      pendingTtlSeconds: 180
    });
  });

  it('rejects invalid ingress mode', () => {
    expect(() =>
      loadConfig({
        FEISHU_APP_ID: 'cli_test',
        FEISHU_APP_SECRET: 'secret_test',
        FEISHU_INGRESS_MODE: 'socket'
      })
    ).toThrow(/FEISHU_INGRESS_MODE/);
  });

  it('rejects default provider outside registered provider keys', () => {
    expect(() =>
      loadConfig({
        FEISHU_APP_ID: 'cli_test',
        FEISHU_APP_SECRET: 'secret_test',
        ADAPTER_FEISHU_PROVIDER_KEYS: 'warning-agent',
        ADAPTER_FEISHU_DEFAULT_PROVIDER: 'another-provider'
      })
    ).toThrow(/ADAPTER_FEISHU_DEFAULT_PROVIDER/);
  });

  it('rejects non-positive TTL values', () => {
    expect(() =>
      loadConfig({
        FEISHU_APP_ID: 'cli_test',
        FEISHU_APP_SECRET: 'secret_test',
        ADAPTER_FEISHU_DEDUPE_TTL_SECONDS: '0'
      })
    ).toThrow(/ADAPTER_FEISHU_DEDUPE_TTL_SECONDS/);
  });
});
