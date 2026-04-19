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

## Honest boundaries

- provider webhook notify-first delivery is supported
- card-action callback dispatch is supported when pending state exists and the target provider implements `handleCallback`
- alert-forward orchestration is intentionally not enabled because `warning-agent` still lacks a stable external report-submission API
