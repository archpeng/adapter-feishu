# adapter-feishu provider integration runbook

## Active PMS/Feishu path

```text
Feishu -> adapter-feishu -> ai-conversation -> pms-platform
```

`adapter-feishu` owns Feishu ingress, message/card delivery, provider routing, short-lived pending callback state, and typed-card callback transport. It does not own PMS business truth or natural-language PMS routing.

## PMS checkout provider

The `pms-checkout` provider is a card/callback surface only:

1. receives PMS platform dry-run/result card payloads from provider webhook;
2. renders Feishu cards and stores short-lived pending callback state;
3. validates typed Feishu card callbacks;
4. forwards accepted callbacks only to fixed pms-platform pending-action endpoints.

Configure platform callback transport:

```env
ADAPTER_FEISHU_PROVIDER_KEYS=warning-agent,pms-checkout
ADAPTER_FEISHU_PMS_PENDING_ACTION_CALLBACK_MODE=platform
PMS_PLATFORM_PENDING_ACTION_BASE_URL=http://127.0.0.1:8791
PMS_PLATFORM_PENDING_ACTION_TOKEN=<local secret, do not commit>
ADAPTER_FEISHU_PENDING_STATE_PATH=.local/pending-actions.json
FEISHU_WEBHOOK_VERIFICATION_TOKEN=<local secret, do not commit>
```

Fixed callback endpoints:

- `POST /v1/pms/pending-actions/status`
- `POST /v1/pms/pending-actions/confirm`
- `POST /v1/pms/pending-actions/cancel`

Callback forwarding uses `Authorization: Bearer <PMS_PLATFORM_PENDING_ACTION_TOKEN>`. Token values, raw Feishu IDs, pending refs, card payload refs, and raw platform URLs with credentials must not be logged or committed.

## Conversation forwarding

Natural-language command turns should be forwarded to `ai-conversation`:

```env
ADAPTER_FEISHU_CONVERSATION_TURN_URL=http://ai-conversation:8793/conversation/feishu-turn
AI_CONVERSATION_INBOUND_AUTH_TOKEN=<local secret, do not commit>
ADAPTER_FEISHU_ALLOWED_CHAT_IDS=<allowed chat ids>
```

`ai-conversation` performs semantic routing and safe PMS tool planning; `pms-platform` owns PMS truth and workflow execution.

## Validation

```bash
npm run test -- test/providers/pms-checkout-provider.test.ts test/runtime.test.ts
npm run verify
```
