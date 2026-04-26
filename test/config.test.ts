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
      allowProviderOverride: false,
      webhookAuthToken: undefined
    });
    expect(config.form).toEqual({
      webhookAuthToken: undefined,
      allowTargetOverride: false,
      userIdType: 'user_id',
      defaultTarget: undefined,
      registryPath: undefined
    });
    expect(config.state).toEqual({
      dedupeTtlSeconds: 300,
      pendingTtlSeconds: 900,
      pendingStatePath: undefined
    });
    expect(config.pmsCheckout).toEqual({
      callbackUrl: undefined,
      callbackToken: undefined,
      callbackTokenHeader: 'X-AI-PMS-CALLBACK-TOKEN',
      callbackTokenEnvName: 'AI_PMS_CALLBACK_TOKEN',
      callbackTimeoutMs: 5000
    });
  });

  it('supports long_connection and explicit provider and form webhook registration', () => {
    const config = loadConfig({
      FEISHU_APP_ID: 'cli_test',
      FEISHU_APP_SECRET: 'secret_test',
      FEISHU_INGRESS_MODE: 'long_connection',
      ADAPTER_FEISHU_PROVIDER_KEYS: 'warning-agent, incident-bot',
      ADAPTER_FEISHU_DEFAULT_PROVIDER: 'incident-bot',
      ADAPTER_FEISHU_ALLOW_PROVIDER_OVERRIDE: 'true',
      ADAPTER_FEISHU_PROVIDER_WEBHOOK_AUTH_TOKEN: 'provider-token-1',
      ADAPTER_FEISHU_FORM_WEBHOOK_AUTH_TOKEN: 'form-token-1',
      ADAPTER_FEISHU_FORM_ALLOW_TARGET_OVERRIDE: 'true',
      ADAPTER_FEISHU_FORM_USER_ID_TYPE: 'open_id',
      ADAPTER_FEISHU_FORM_DEFAULT_APP_TOKEN: 'app_token_1',
      ADAPTER_FEISHU_FORM_DEFAULT_TABLE_ID: 'tbl_1',
      ADAPTER_FEISHU_FORM_DEFAULT_FORM_ID: 'form_1',
      ADAPTER_FEISHU_FORM_REGISTRY_PATH: 'config/form-bindings.example.json',
      ADAPTER_FEISHU_DEDUPE_TTL_SECONDS: '60',
      ADAPTER_FEISHU_PENDING_TTL_SECONDS: '180',
      ADAPTER_FEISHU_PENDING_STATE_PATH: '.local/pending-actions.json',
      ADAPTER_FEISHU_PMS_CHECKOUT_CALLBACK_URL: 'http://127.0.0.1:8792/pms/checkout/callback',
      ADAPTER_FEISHU_PMS_CHECKOUT_CALLBACK_TIMEOUT_MS: '2500',
      AI_PMS_CALLBACK_TOKEN: 'callback-token-1'
    });

    expect(config.feishu.ingressMode).toBe('long_connection');
    expect(config.providers).toEqual({
      keys: ['warning-agent', 'incident-bot'],
      defaultProvider: 'incident-bot',
      allowProviderOverride: true,
      webhookAuthToken: 'provider-token-1'
    });
    expect(config.form).toEqual({
      webhookAuthToken: 'form-token-1',
      allowTargetOverride: true,
      userIdType: 'open_id',
      defaultTarget: {
        appToken: 'app_token_1',
        tableId: 'tbl_1',
        formId: 'form_1'
      },
      registryPath: 'config/form-bindings.example.json'
    });
    expect(config.state).toEqual({
      dedupeTtlSeconds: 60,
      pendingTtlSeconds: 180,
      pendingStatePath: '.local/pending-actions.json'
    });
    expect(config.pmsCheckout).toEqual({
      callbackUrl: 'http://127.0.0.1:8792/pms/checkout/callback',
      callbackToken: 'callback-token-1',
      callbackTokenHeader: 'X-AI-PMS-CALLBACK-TOKEN',
      callbackTokenEnvName: 'AI_PMS_CALLBACK_TOKEN',
      callbackTimeoutMs: 2500
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

  it('rejects invalid form user id type', () => {
    expect(() =>
      loadConfig({
        FEISHU_APP_ID: 'cli_test',
        FEISHU_APP_SECRET: 'secret_test',
        ADAPTER_FEISHU_FORM_USER_ID_TYPE: 'employee_id'
      })
    ).toThrow(/ADAPTER_FEISHU_FORM_USER_ID_TYPE/);
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

  it('rejects incomplete form default target configuration', () => {
    expect(() =>
      loadConfig({
        FEISHU_APP_ID: 'cli_test',
        FEISHU_APP_SECRET: 'secret_test',
        ADAPTER_FEISHU_FORM_DEFAULT_APP_TOKEN: 'app_token_1'
      })
    ).toThrow(/ADAPTER_FEISHU_FORM_DEFAULT_APP_TOKEN/);
  });

  it('requires callback auth token when PMS checkout callback URL is configured', () => {
    expect(() =>
      loadConfig({
        FEISHU_APP_ID: 'cli_test',
        FEISHU_APP_SECRET: 'secret_test',
        ADAPTER_FEISHU_PMS_CHECKOUT_CALLBACK_URL: 'http://127.0.0.1:8792/pms/checkout/callback'
      })
    ).toThrow(/AI_PMS_CALLBACK_TOKEN/);
  });

  it('rejects invalid PMS checkout callback URL', () => {
    expect(() =>
      loadConfig({
        FEISHU_APP_ID: 'cli_test',
        FEISHU_APP_SECRET: 'secret_test',
        ADAPTER_FEISHU_PMS_CHECKOUT_CALLBACK_URL: 'not-a-url',
        AI_PMS_CALLBACK_TOKEN: 'callback-token-1'
      })
    ).toThrow(/ADAPTER_FEISHU_PMS_CHECKOUT_CALLBACK_URL/);
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
