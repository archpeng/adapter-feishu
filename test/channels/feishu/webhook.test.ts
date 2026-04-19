import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { dispatchWebhookRequest } from '../../../src/channels/feishu/webhook.js';

describe('dispatchWebhookRequest', () => {
  it('responds to url verification challenge', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const response = await dispatchWebhookRequest(
      {
        method: 'POST',
        headers: {},
        rawBody: JSON.stringify({
          type: 'url_verification',
          challenge: 'hello',
          token: 'token-1'
        })
      },
      { host: '127.0.0.1', port: 0, verificationToken: 'token-1' },
      handler
    );

    expect(response).toEqual({ statusCode: 200, body: { challenge: 'hello' } });
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects invalid webhook tokens', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const response = await dispatchWebhookRequest(
      {
        method: 'POST',
        headers: {},
        rawBody: JSON.stringify({
          header: { event_id: 'evt-1', event_type: 'im.message.receive_v1' },
          token: 'bad-token'
        })
      },
      { host: '127.0.0.1', port: 0, verificationToken: 'token-1' },
      handler
    );

    expect(response.statusCode).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('handles legal message events and forwards normalized inbound turn', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const body = {
      header: {
        event_id: 'evt-1',
        event_type: 'im.message.receive_v1'
      },
      event: {
        sender: { sender_id: { open_id: 'ou-user-1' } },
        message: {
          message_id: 'msg-1',
          chat_id: 'oc-chat-1',
          message_type: 'text',
          content: JSON.stringify({ text: 'hello' })
        }
      }
    };

    const response = await dispatchWebhookRequest(
      {
        method: 'POST',
        headers: {},
        rawBody: JSON.stringify(body)
      },
      { host: '127.0.0.1', port: 0 },
      handler
    );

    expect(response.statusCode).toBe(200);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        turnId: 'msg-1',
        channel: 'feishu',
        text: 'hello',
        target: expect.objectContaining({ chatId: 'oc-chat-1' })
      }),
      expect.objectContaining({ source: 'webhook' })
    );
  });

  it('accepts signed requests when webhook secret matches', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const secret = 'webhook-secret';
    const body = JSON.stringify({
      header: {
        event_id: 'evt-2',
        event_type: 'im.message.receive_v1'
      },
      event: {
        message: {
          message_id: 'msg-2',
          chat_id: 'oc-chat-1',
          message_type: 'text',
          content: JSON.stringify({ text: 'hello' })
        }
      }
    });
    const timestamp = '1710000000';
    const nonce = 'nonce-1';
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}:${nonce}:${body}`)
      .digest('hex');

    const response = await dispatchWebhookRequest(
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lark-request-timestamp': timestamp,
          'x-lark-request-nonce': nonce,
          'x-lark-signature': signature
        },
        rawBody: body
      },
      { host: '127.0.0.1', port: 0, secret },
      handler
    );

    expect(response.statusCode).toBe(200);
    expect(handler).toHaveBeenCalled();
  });
});
