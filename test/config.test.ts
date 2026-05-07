import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const baseEnv = {
  FEISHU_APP_ID: 'app-id-1',
  FEISHU_APP_SECRET: 'app-secret-1',
  PMS_PLATFORM_PENDING_ACTION_BASE_URL: 'http://127.0.0.1:8791',
  PMS_PLATFORM_PENDING_ACTION_TOKEN: 'platform-token-1',
};

describe('loadConfig', () => {
  it('loads platform-only defaults for PMS callbacks', () => {
    const config = loadConfig(baseEnv);

    expect(config.service).toEqual({ host: '0.0.0.0', port: 8787, publicBaseUrl: undefined });
    expect(config.feishu.ingressMode).toBe('webhook');
    expect(config.providers.keys).toEqual(['warning-agent']);
    expect(config.form.registryPath).toBeUndefined();
    expect(config.pmsCheckout).toEqual(expect.objectContaining({
      callbackTimeoutMs: 5_000,
      pendingActionCallbackMode: 'platform',
      pendingActionBaseUrl: 'http://127.0.0.1:8791/',
      pendingActionToken: 'platform-token-1',
      pendingActionTokenEnvName: 'PMS_PLATFORM_PENDING_ACTION_TOKEN',
      pendingActionTimeoutMs: 5_000,
    }));
  });

  it('supports long_connection, PMS Agent forwarding, provider selection, and allowlists', () => {
    const config = loadConfig({
      ...baseEnv,
      FEISHU_INGRESS_MODE: 'long_connection',
      ADAPTER_FEISHU_PROVIDER_KEYS: 'pms-checkout,warning-agent',
      ADAPTER_FEISHU_DEFAULT_PROVIDER: 'pms-checkout',
      ADAPTER_FEISHU_ALLOWED_CHAT_IDS: 'oc-chat-1,oc-chat-2',
      PMS_AGENT_TURN_URL: 'http://127.0.0.1:8795/v1/feishu-turn',
      PMS_AGENT_AUTH_TOKEN: 'agent-token-1',
      ADAPTER_FEISHU_PMS_PENDING_ACTION_CALLBACK_TIMEOUT_MS: '7000',
    });

    expect(config.feishu.ingressMode).toBe('long_connection');
    expect(config.providers.keys).toEqual(['pms-checkout', 'warning-agent']);
    expect(config.providers.defaultProvider).toBe('pms-checkout');
    expect(config.pmsAgent.turnUrl).toBe('http://127.0.0.1:8795/v1/feishu-turn');
    expect(config.pmsAgent.authToken).toBe('agent-token-1');
    expect(config.pmsAgent.authEnvName).toBe('PMS_AGENT_AUTH_TOKEN');
    expect(config.pmsAgent.allowedChatIds).toEqual(['oc-chat-1', 'oc-chat-2']);
    expect(config.pmsCheckout.pendingActionTimeoutMs).toBe(7000);
  });

  it('requires platform pending-action credentials for PMS callback handling', () => {
    expect(() => loadConfig({ FEISHU_APP_ID: 'app-id-1', FEISHU_APP_SECRET: 'app-secret-1' })).toThrow(/PMS_PLATFORM_PENDING_ACTION_BASE_URL/);
    expect(() => loadConfig({ ...baseEnv, PMS_PLATFORM_PENDING_ACTION_TOKEN: '' })).toThrow(/PMS_PLATFORM_PENDING_ACTION_BASE_URL/);
  });

  it('rejects non-platform callback modes', () => {
    expect(() => loadConfig({
      ...baseEnv,
      ADAPTER_FEISHU_PMS_PENDING_ACTION_CALLBACK_MODE: 'not-platform',
    })).toThrow(/must be platform/);
  });

  it('keeps existing validation for Feishu, provider, form, PMS Agent, URL, and TTL config', () => {
    expect(() => loadConfig({ ...baseEnv, FEISHU_INGRESS_MODE: 'socket' })).toThrow(/FEISHU_INGRESS_MODE/);
    expect(() => loadConfig({ ...baseEnv, ADAPTER_FEISHU_FORM_USER_ID_TYPE: 'employee_id' })).toThrow(/ADAPTER_FEISHU_FORM_USER_ID_TYPE/);
    expect(() => loadConfig({ ...baseEnv, ADAPTER_FEISHU_PROVIDER_KEYS: 'warning-agent', ADAPTER_FEISHU_DEFAULT_PROVIDER: 'pms-checkout' })).toThrow(/ADAPTER_FEISHU_DEFAULT_PROVIDER/);
    expect(() => loadConfig({ ...baseEnv, ADAPTER_FEISHU_FORM_DEFAULT_APP_TOKEN: 'app-token-1' })).toThrow(/ADAPTER_FEISHU_FORM_DEFAULT_APP_TOKEN/);
    expect(() => loadConfig({ ...baseEnv, PMS_AGENT_TURN_URL: 'http://127.0.0.1:8795/v1/feishu-turn', ADAPTER_FEISHU_ALLOWED_CHAT_IDS: 'oc-chat-1' })).toThrow(/PMS_AGENT_AUTH_TOKEN/);
    expect(() => loadConfig({ ...baseEnv, PMS_PLATFORM_PENDING_ACTION_BASE_URL: 'not-a-url' })).toThrow(/PMS_PLATFORM_PENDING_ACTION_BASE_URL/);
    expect(() => loadConfig({ ...baseEnv, ADAPTER_FEISHU_DEDUPE_TTL_SECONDS: '0' })).toThrow(/ADAPTER_FEISHU_DEDUPE_TTL_SECONDS/);
  });

  it('rejects deprecated ai-conversation configuration', () => {
    expect(() => loadConfig({
      ...baseEnv,
      ADAPTER_FEISHU_CONVERSATION_TURN_URL: 'http://127.0.0.1:8793/conversation/feishu-turn'
    })).toThrow(/ai-conversation is no longer supported/);
    expect(() => loadConfig({
      ...baseEnv,
      AI_CONVERSATION_INBOUND_AUTH_TOKEN: 'conversation-token-1'
    })).toThrow(/ai-conversation is no longer supported/);
    expect(() => loadConfig({
      ...baseEnv,
      ADAPTER_FEISHU_CONVERSATION_TURN_TIMEOUT_MS: '7000'
    })).toThrow(/ai-conversation is no longer supported/);
  });
});
