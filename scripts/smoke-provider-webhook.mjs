const baseUrl = process.env.ADAPTER_FEISHU_SMOKE_BASE_URL?.trim() || 'http://127.0.0.1:8787';
const chatId = process.env.ADAPTER_FEISHU_SMOKE_CHAT_ID?.trim();
const openId = process.env.ADAPTER_FEISHU_SMOKE_OPEN_ID?.trim();
const authToken = process.env.ADAPTER_FEISHU_PROVIDER_WEBHOOK_AUTH_TOKEN?.trim();

if (!chatId && !openId) {
  console.error(
    'Missing smoke target. Set ADAPTER_FEISHU_SMOKE_CHAT_ID or ADAPTER_FEISHU_SMOKE_OPEN_ID before running.'
  );
  process.exit(1);
}

const reportId = `smoke-${Date.now().toString(36)}`;
const target = chatId
  ? { channel: 'feishu', chatId }
  : { channel: 'feishu', openId };
const payload = {
  reportId,
  runId: `smoke-run-${Date.now().toString(36)}`,
  summary: 'adapter-feishu smoke test',
  severity: 'info',
  bodyMarkdown: 'Smoke test notification delivered through provider webhook.',
  incidentId: reportId,
  target
};

const response = await fetch(`${baseUrl.replace(/\/$/, '')}/providers/webhook`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(authToken ? { authorization: `Bearer ${authToken}` } : {})
  },
  body: JSON.stringify(payload)
});

const body = await response.json().catch(() => ({}));
console.log(JSON.stringify({ status: response.status, body }, null, 2));

if (!response.ok || body.code !== 0) {
  process.exit(1);
}
