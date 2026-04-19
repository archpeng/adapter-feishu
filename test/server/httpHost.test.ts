import { describe, expect, it, vi } from 'vitest';
import { dispatchAdapterHttpRequest } from '../../src/server/httpHost.js';

describe('dispatchAdapterHttpRequest', () => {
  it('serves health and routes provider/card/feishu requests to the correct handler', async () => {
    const handleFeishuWebhook = vi.fn().mockResolvedValue({
      statusCode: 200,
      body: { code: 0 }
    });
    const handleProviderWebhook = vi.fn().mockResolvedValue({
      statusCode: 202,
      body: { code: 0, status: 'delivered' }
    });
    const handleCardAction = vi.fn().mockResolvedValue({
      statusCode: 200,
      body: { code: 0, status: 'accepted' }
    });

    const health = await dispatchAdapterHttpRequest(
      {
        method: 'GET',
        pathname: '/health',
        headers: {},
        rawBody: ''
      },
      {
        ingressMode: 'webhook',
        providerKeys: ['warning-agent'],
        handleFeishuWebhook,
        handleProviderWebhook,
        handleCardAction
      }
    );
    const providerWebhook = await dispatchAdapterHttpRequest(
      {
        method: 'POST',
        pathname: '/providers/webhook',
        headers: {},
        rawBody: '{}'
      },
      {
        ingressMode: 'webhook',
        providerKeys: ['warning-agent'],
        handleFeishuWebhook,
        handleProviderWebhook,
        handleCardAction
      }
    );
    const cardAction = await dispatchAdapterHttpRequest(
      {
        method: 'POST',
        pathname: '/providers/card-action',
        headers: {},
        rawBody: '{}'
      },
      {
        ingressMode: 'webhook',
        providerKeys: ['warning-agent'],
        handleFeishuWebhook,
        handleProviderWebhook,
        handleCardAction
      }
    );
    const feishuWebhook = await dispatchAdapterHttpRequest(
      {
        method: 'POST',
        pathname: '/webhook',
        headers: {
          'x-lark-signature': 'signature-1'
        },
        rawBody: '{"token":"token-1"}'
      },
      {
        ingressMode: 'webhook',
        providerKeys: ['warning-agent'],
        handleFeishuWebhook,
        handleProviderWebhook,
        handleCardAction
      }
    );

    expect(health).toEqual({
      statusCode: 200,
      body: {
        code: 0,
        status: 'ok',
        ingressMode: 'webhook',
        providers: ['warning-agent']
      }
    });
    expect(providerWebhook.statusCode).toBe(202);
    expect(cardAction.statusCode).toBe(200);
    expect(feishuWebhook.statusCode).toBe(200);
    expect(handleProviderWebhook).toHaveBeenCalledTimes(1);
    expect(handleCardAction).toHaveBeenCalledTimes(1);
    expect(handleFeishuWebhook).toHaveBeenCalledWith({
      method: 'POST',
      pathname: '/webhook',
      headers: {
        'x-lark-signature': 'signature-1'
      },
      rawBody: '{"token":"token-1"}'
    });
  });
});
