# adapter-feishu warning-agent onboarding

## Purpose

This runbook is the practical integration guide for `warning-agent` teams that need to send notify-first deliveries through `adapter-feishu`.

Current supported path:

```text
warning-agent -> adapter-feishu -> Feishu/Lark
```

Current non-goal:

```text
raw alert -> adapter-feishu -> warning-agent orchestration -> Feishu
```

`adapter-feishu` is already responsible for:

- Feishu API access token handling
- Feishu message / card delivery
- notify-first provider webhook ingress
- provider-side dedupe

`warning-agent` only needs to send a completed notification payload to `adapter-feishu`.

## Preconditions

Before integrating `warning-agent`, make sure the deployed `adapter-feishu` instance already has:

- real Feishu app credentials configured
- a reachable HTTP endpoint
- provider `warning-agent` enabled
- optional provider webhook auth token if the deployment requires it

For local same-host development, the current deployed adapter endpoint is:

```text
http://127.0.0.1:8787
```

## Endpoint contract

`warning-agent` should call:

```text
POST <ADAPTER_FEISHU_BASE_URL>/providers/webhook
```

Headers:

- `content-type: application/json`
- optional auth, only when adapter-feishu is configured with `ADAPTER_FEISHU_PROVIDER_WEBHOOK_AUTH_TOKEN`

Auth options:

- `Authorization: Bearer <token>`
- `x-adapter-provider-token: <token>`

Timeout guidance:

- `5s` is a reasonable bounded default for warning-agent

## Required warning-agent runtime env

At minimum, warning-agent should configure:

```text
WARNING_AGENT_ADAPTER_FEISHU_BASE_URL=<adapter-feishu base url>
```

If warning-agent uses a fixed default delivery target, it should also keep one of:

```text
WARNING_AGENT_ADAPTER_FEISHU_CHAT_ID=<oc_xxx>
WARNING_AGENT_ADAPTER_FEISHU_OPEN_ID=<ou_xxx>
```

If warning-agent derives the target dynamically from its own report or routing logic, then it must still emit a valid `target` object in the outbound payload.

Optional:

```text
WARNING_AGENT_ADAPTER_FEISHU_THREAD_ID=<thread id>
WARNING_AGENT_ADAPTER_FEISHU_PROVIDER_WEBHOOK_AUTH_TOKEN=<shared token>
```

## Minimum payload

Current minimal accepted payload:

```json
{
  "reportId": "report-20260420-001",
  "runId": "wr_20260420_001",
  "summary": "CPU usage exceeded threshold on payment-service",
  "target": {
    "channel": "feishu",
    "chatId": "oc_xxx"
  }
}
```

Recommended payload:

```json
{
  "providerKey": "warning-agent",
  "reportId": "report-20260420-001",
  "runId": "wr_20260420_001",
  "title": "[P1] payment-service /api/pay",
  "summary": "payment-service /api/pay requires page_owner after cloud_fallback investigation",
  "occurredAt": "2026-04-20T08:00:24Z",
  "severity": "critical",
  "bodyMarkdown": "## Executive Summary\n- service: `payment-service`",
  "incidentId": "incident-payment-api-pay-001",
  "target": {
    "channel": "feishu",
    "chatId": "oc_xxx"
  },
  "facts": [
    { "label": "service", "value": "payment-service" },
    { "label": "operation", "value": "/api/pay" },
    { "label": "delivery_class", "value": "page_owner" }
  ]
}
```

Field rules:

- `reportId`: required, stable report identifier
- `runId`: required, warning-agent run anchor
- `summary`: required, short human-readable summary
- `target`: required in current runtime practice
- `target.channel`: must be `feishu`
- `target.chatId` or `target.openId`: at least one must be present
- `incidentId`: recommended for stronger dedupe

Notes:

- `providerKey` is not required by the current adapter runtime, but warning-agent should still send `warning-agent` explicitly
- if `severity`, `bodyMarkdown`, or `facts` are present, adapter-feishu will render a richer Feishu interactive card
- current phase treats cards as read-only delivery surfaces; do not depend on callback buttons

## Response contract

Successful adapter response:

- HTTP `202`
- JSON `code = 0`
- JSON `providerKey = "warning-agent"`
- JSON `status in {"delivered", "duplicate_ignored"}`

Example:

```json
{
  "code": 0,
  "providerKey": "warning-agent",
  "status": "delivered"
}
```

Recommended warning-agent handling:

- `delivered`: success
- `duplicate_ignored`: idempotent success
- `400` / `401`: configuration or payload problem, fail closed and do not blind-retry
- `500` / `502`: adapter or downstream failure, bounded retry is acceptable

## Python integration shape

Recommended warning-agent client boundary:

```python
def post_adapter_feishu_notification(
    *,
    endpoint: str,
    payload: dict[str, object],
    timeout_seconds: int,
    auth_token: str | None = None,
) -> BridgeDispatchResult: ...
```

Recommended payload builder boundary:

```python
def build_adapter_feishu_notification_payload(
    report_record: Mapping[str, object],
    *,
    target: ResolvedFeishuTarget,
) -> AdapterFeishuNotificationPayload: ...
```

This keeps the integration split into:

- target/env resolution
- payload build
- bounded HTTP post
- bridge result interpretation

## Validation checklist

Before claiming the integration is ready, verify:

1. warning-agent can resolve the adapter base URL
2. warning-agent emits a payload with `reportId`, `runId`, `summary`, and `target`
3. adapter-feishu returns `202` with `code = 0`
4. the target Feishu user or group actually receives the message/card
5. duplicate replay with the same `incidentId` or `reportId` returns `duplicate_ignored`

## Honest boundaries

This onboarding guide does not imply support for:

- alert-forward orchestration
- warning-agent report polling by adapter-feishu
- interactive callback closed loop
- multi-provider coordination
- dynamic per-recipient routing outside warning-agent's own targeting logic
