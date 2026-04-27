import { describe, expect, it, vi } from 'vitest';
import { createLongConnectionIngress } from '../../../src/channels/feishu/longConnection.js';

describe('createLongConnectionIngress', () => {
  it('registers message handler and forwards normalized inbound turns', async () => {
    let registered: Record<string, (data: Record<string, unknown>) => Promise<unknown>> | null = null;
    const handleTurn = vi.fn().mockResolvedValue(undefined);
    const wsClient = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined)
    };

    const ingress = createLongConnectionIngress(
      { appId: 'app-id', appSecret: 'app-secret' },
      handleTurn,
      {
        createWsClient: () => wsClient,
        createEventDispatcher: () => ({
          register(handlers) {
            registered = handlers;
            return this;
          }
        })
      }
    );

    await ingress.start();
    if (!registered) {
      throw new Error('expected handlers to be registered');
    }

    await registered['im.message.receive_v1']({
      sender: { sender_id: { open_id: 'ou-user-1' } },
      message: {
        message_id: 'msg-1',
        chat_id: 'oc-chat-1',
        message_type: 'text',
        content: JSON.stringify({ text: 'hello' })
      }
    });

    expect(wsClient.start).toHaveBeenCalled();
    expect(handleTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        turnId: 'msg-1',
        text: 'hello',
        target: expect.objectContaining({ chatId: 'oc-chat-1' })
      }),
      expect.objectContaining({ source: 'long_connection' })
    );
  });

  it('normalizes full v2 message envelopes from the long-connection dispatcher', async () => {
    let registered: Record<string, (data: Record<string, unknown>) => Promise<unknown>> | null = null;
    const handleTurn = vi.fn().mockResolvedValue(undefined);
    const wsClient = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined)
    };

    const ingress = createLongConnectionIngress(
      { appId: 'app-id', appSecret: 'app-secret' },
      handleTurn,
      {
        createWsClient: () => wsClient,
        createEventDispatcher: () => ({
          register(handlers) {
            registered = handlers;
            return this;
          }
        })
      }
    );

    await ingress.start();
    if (!registered) {
      throw new Error('expected handlers to be registered');
    }

    await registered['im.message.receive_v1']({
      schema: '2.0',
      header: { event_id: 'evt-1', event_type: 'im.message.receive_v1' },
      event: {
        sender: { sender_id: { open_id: 'ou-user-1' } },
        message: {
          message_id: 'msg-1',
          chat_id: 'oc-chat-1',
          message_type: 'text',
          content: JSON.stringify({ text: 'hello from envelope' })
        }
      }
    });

    expect(handleTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        turnId: 'msg-1',
        text: 'hello from envelope',
        target: expect.objectContaining({ chatId: 'oc-chat-1' })
      }),
      expect.objectContaining({ source: 'long_connection' })
    );
  });

  it('registers card action handler and forwards long-connection card callbacks to the shared card dispatcher', async () => {
    let registered: Record<string, (data: Record<string, unknown>) => Promise<unknown>> | null = null;
    const handleCardAction = vi.fn().mockResolvedValue({ code: 0, status: 'accepted' });
    const wsClient = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined)
    };
    const payload = {
      schema: '2.0',
      header: {
        event_id: 'evt-card-action-1',
        event_type: 'card.action.trigger',
        token: 'feishu-token-1'
      },
      event: {
        action: {
          value: {
            providerKey: 'pms-checkout',
            pendingId: 'pending-1',
            actionId: 'pms.checkout.confirm'
          }
        }
      }
    };

    const ingress = createLongConnectionIngress(
      { appId: 'app-id', appSecret: 'app-secret' },
      vi.fn().mockResolvedValue(undefined),
      {
        createWsClient: () => wsClient,
        createEventDispatcher: () => ({
          register(handlers) {
            registered = handlers;
            return this;
          }
        })
      },
      { handleCardAction }
    );

    await ingress.start();
    if (!registered) {
      throw new Error('expected handlers to be registered');
    }

    const result = await registered['card.action.trigger'](payload);

    expect(result).toEqual({ code: 0, status: 'accepted' });
    expect(handleCardAction).toHaveBeenCalledWith({
      method: 'POST',
      pathname: '/webhook/card',
      rawBody: JSON.stringify(payload),
      trustedSource: 'long_connection'
    });
  });

  it('stops the ws client when available', async () => {
    const wsClient = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined)
    };
    const ingress = createLongConnectionIngress(
      { appId: 'app-id', appSecret: 'app-secret' },
      vi.fn().mockResolvedValue(undefined),
      {
        createWsClient: () => wsClient,
        createEventDispatcher: () => ({
          register() {
            return this;
          }
        })
      }
    );

    await ingress.stop();

    expect(wsClient.stop).toHaveBeenCalled();
  });
});
