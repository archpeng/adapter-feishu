import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFeishuClient } from '../../../src/channels/feishu/client.js';

describe('createFeishuClient', () => {
  const fetchImpl = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchImpl.mockReset();
  });

  it('caches tenant access token across sends', async () => {
    fetchImpl
      .mockResolvedValueOnce(createResponse({ code: 0, tenant_access_token: 'token-1', expire: 7200 }))
      .mockResolvedValueOnce(createResponse({ code: 0, data: { message_id: 'msg-1' } }))
      .mockResolvedValueOnce(createResponse({ code: 0, data: { message_id: 'msg-2' } }));

    const client = createFeishuClient({
      appId: 'app-id',
      appSecret: 'app-secret',
      baseUrl: 'https://feishu.test',
      fetchImpl
    });

    await client.sendText({ channel: 'feishu', chatId: 'oc-chat-1' }, 'hello');
    await client.sendCard({ channel: 'feishu', openId: 'ou-user-1' }, { header: { title: 'ok' } });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://feishu.test/open-apis/auth/v3/tenant_access_token/internal'
    );
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain('receive_id_type=chat_id');
    expect(String(fetchImpl.mock.calls[2]?.[0])).toContain('receive_id_type=open_id');
  });

  it('serializes interactive cards for message send', async () => {
    fetchImpl
      .mockResolvedValueOnce(createResponse({ code: 0, tenant_access_token: 'token-1', expire: 7200 }))
      .mockResolvedValueOnce(createResponse({ code: 0, data: { message_id: 'msg-2' } }));

    const client = createFeishuClient({
      appId: 'app-id',
      appSecret: 'app-secret',
      baseUrl: 'https://feishu.test',
      fetchImpl
    });

    await client.sendCard(
      { channel: 'feishu', chatId: 'oc-chat-1', threadId: 'om-thread-1' },
      { header: { title: '审批' } }
    );

    const request = fetchImpl.mock.calls[1]?.[1];
    expect(request).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      receive_id: 'oc-chat-1',
      msg_type: 'interactive',
      uuid: 'om-thread-1'
    });
  });

  it('throws when upstream token fetch fails', async () => {
    fetchImpl.mockResolvedValueOnce(createResponse({ code: 999, msg: 'denied' }, 403));

    const client = createFeishuClient({
      appId: 'app-id',
      appSecret: 'app-secret',
      baseUrl: 'https://feishu.test',
      fetchImpl
    });

    await expect(client.sendText({ channel: 'feishu', chatId: 'oc-chat-1' }, 'hello')).rejects.toThrow(
      /Failed to acquire Feishu tenant access token/
    );
  });
});

function createResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}
