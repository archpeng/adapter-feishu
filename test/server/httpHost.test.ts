import { describe, expect, it, vi } from 'vitest';
import { dispatchAdapterHttpRequest } from '../../src/server/httpHost.js';

describe('dispatchAdapterHttpRequest', () => {
  it('serves health and routes provider/form/card/feishu requests to the correct handler', async () => {
    const handleFeishuWebhook = vi.fn().mockResolvedValue({
      statusCode: 200,
      body: { code: 0 }
    });
    const handleProviderWebhook = vi.fn().mockResolvedValue({
      statusCode: 202,
      body: { code: 0, status: 'delivered' }
    });
    const handleFormWebhook = vi.fn().mockResolvedValue({
      statusCode: 200,
      body: { code: 0, status: 'record_created', recordId: 'rec_1' }
    });
    const handleCardAction = vi.fn().mockResolvedValue({
      statusCode: 200,
      body: { code: 0, status: 'accepted' }
    });

    const deps = {
      ingressMode: 'webhook' as const,
      providerKeys: ['warning-agent'],
      handleFeishuWebhook,
      handleProviderWebhook,
      handleFormWebhook,
      handleCardAction
    };

    const health = await dispatchAdapterHttpRequest(
      {
        method: 'GET',
        pathname: '/health',
        headers: {},
        rawBody: ''
      },
      deps
    );
    const providerWebhook = await dispatchAdapterHttpRequest(
      {
        method: 'POST',
        pathname: '/providers/webhook',
        headers: {},
        rawBody: '{}'
      },
      deps
    );
    const formWebhook = await dispatchAdapterHttpRequest(
      {
        method: 'POST',
        pathname: '/providers/form-webhook',
        headers: {},
        rawBody: '{}'
      },
      deps
    );
    const cardAction = await dispatchAdapterHttpRequest(
      {
        method: 'POST',
        pathname: '/providers/card-action',
        headers: {},
        rawBody: '{}'
      },
      deps
    );
    const realCardAction = await dispatchAdapterHttpRequest(
      {
        method: 'POST',
        pathname: '/webhook/card',
        headers: {},
        rawBody: '{}'
      },
      deps
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
      deps
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
    expect(formWebhook).toEqual({
      statusCode: 200,
      body: { code: 0, status: 'record_created', recordId: 'rec_1' }
    });
    expect(cardAction.statusCode).toBe(200);
    expect(realCardAction.statusCode).toBe(200);
    expect(feishuWebhook.statusCode).toBe(200);
    expect(handleProviderWebhook).toHaveBeenCalledTimes(1);
    expect(handleFormWebhook).toHaveBeenCalledTimes(1);
    expect(handleCardAction).toHaveBeenCalledTimes(2);
    expect(handleFeishuWebhook).toHaveBeenCalledTimes(1);
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
