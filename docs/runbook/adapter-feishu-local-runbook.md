# adapter-feishu local runbook

## Purpose

Run `adapter-feishu` locally as a standalone Feishu/Lark channel service with:

- health endpoint
- provider webhook ingress
- Feishu webhook ingress in `webhook` mode
- Feishu long-connection ingress in `long_connection` mode

## Prerequisites

- Node.js `>= 22`
- npm
- a Feishu/Lark app with valid `app_id` and `app_secret`

## Setup

1. Install dependencies:
   - `npm install`
2. Copy environment template:
   - `cp .env.example .env`
3. Fill in at least:
   - `FEISHU_APP_ID`
   - `FEISHU_APP_SECRET`
4. Choose ingress mode:
   - `FEISHU_INGRESS_MODE=webhook`
   - or `FEISHU_INGRESS_MODE=long_connection`

## Verify before running

- `npm run verify`

## Start the service

1. Build the service:
   - `npm run build`
2. Start the runtime:
   - `npm run start`

Expected startup log:

- `adapter-feishu started on <host>:<port> (<ingressMode>)`

## HTTP endpoints

### Health

- `GET /health`

Example:

```bash
curl http://127.0.0.1:8787/health
```

### Provider webhook

- `POST /providers/webhook`

This is the notify-first path for provider pushes such as `warning-agent -> adapter-feishu -> Feishu`.

### Provider card action callback

- `POST /providers/card-action`

This resolves provider-scoped pending callback state before forwarding callback turns to the provider.

### Feishu webhook ingress

Only active when `FEISHU_INGRESS_MODE=webhook`.

- `POST /webhook`

When `FEISHU_INGRESS_MODE=long_connection`, Feishu webhook ingress returns `501 feishu_webhook_disabled` and long-connection ingress is used instead.

## Docker

Build:

- `docker build -t adapter-feishu:local .`

Run:

- `docker run --rm -p 8787:8787 --env-file .env adapter-feishu:local`

## Provider webhook auth

For deployed environments, set:

- `ADAPTER_FEISHU_PROVIDER_WEBHOOK_AUTH_TOKEN=<shared-token>`

When enabled, provider pushes to `/providers/webhook` must send either:

- `Authorization: Bearer <shared-token>`
- `x-adapter-provider-token: <shared-token>`

## PMS checkout provider local mode

To enable the PMS checkout card/callback provider in the local sandbox profile:

```env
ADAPTER_FEISHU_PROVIDER_KEYS=warning-agent,pms-checkout
ADAPTER_FEISHU_DEFAULT_PROVIDER=warning-agent
ADAPTER_FEISHU_ALLOW_PROVIDER_OVERRIDE=true
ADAPTER_FEISHU_PENDING_STATE_PATH=.local/pending-actions.json
ADAPTER_FEISHU_PMS_CHECKOUT_CALLBACK_URL=http://127.0.0.1:<ai-pms-port>/pms/checkout/callback
ADAPTER_FEISHU_PMS_CHECKOUT_CALLBACK_TIMEOUT_MS=5000
AI_PMS_CALLBACK_TOKEN=<local secret, do not commit>
```

Expected health shape when enabled:

```json
{
  "code": 0,
  "status": "ok",
  "ingressMode": "long_connection",
  "providers": ["warning-agent", "pms-checkout"]
}
```

The provider persists pending `pms.checkout.confirm` actions before dry-run card delivery, reloads them from `ADAPTER_FEISHU_PENDING_STATE_PATH` after normal process restart, rejects stale/duplicate/action-mismatch callbacks, and forwards accepted callbacks to ai-pms/Hermes with header `X-AI-PMS-CALLBACK-TOKEN` sourced from `AI_PMS_CALLBACK_TOKEN`.

## Real Feishu smoke test

With a real Feishu app configured in `.env` and the adapter running:

1. set a real target in the environment:
   - `ADAPTER_FEISHU_SMOKE_CHAT_ID=<oc_xxx>`
   - or `ADAPTER_FEISHU_SMOKE_OPEN_ID=<ou_xxx>`
2. if provider webhook auth is enabled, set:
   - `ADAPTER_FEISHU_PROVIDER_WEBHOOK_AUTH_TOKEN=<shared-token>`
3. run:
   - `npm run smoke:provider-webhook`

This uses the real `/providers/webhook` path and verifies end-to-end provider delivery into Feishu.

## Honest boundaries

- provider webhook notify-first delivery is supported
- card-action callback dispatch is supported when pending state exists and the target provider implements `handleCallback`
- alert-forward orchestration is intentionally not enabled because `warning-agent` still lacks a stable external report-submission API
