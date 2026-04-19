# adapter-feishu provider integration

## First provider: warning-agent

The first supported provider path is:

```text
warning-agent -> adapter-feishu -> Feishu/Lark
```

This is intentionally **notify-first**.

`adapter-feishu` currently accepts completed warning-agent report payloads and renders them into Feishu delivery via the shared reply sink.

## Minimum warning-agent payload

`POST /providers/webhook`

```json
{
  "reportId": "report-9",
  "runId": "wr_123",
  "summary": "cpu anomaly investigated",
  "severity": "warning",
  "bodyMarkdown": "Root cause points to deployment config drift.",
  "reportUrl": "https://warning-agent.local/reports/report-9",
  "target": {
    "channel": "feishu",
    "chatId": "oc_xxx"
  }
}
```

Notes:

- `target` is required unless the runtime later injects a default delivery target
- `incidentId` is optional; when present it becomes the preferred dedupe key
- without `incidentId`, the provider falls back to `reportId` for dedupe

## Delivery behavior

The warning-agent provider will:

1. validate that the incoming payload matches the warning-agent contract
2. normalize it into the shared `ProviderNotification` shape
3. render a rich interactive diagnosis card
4. deliver through the shared Feishu reply sink

## Optional callback path

If a card action carries:

- `providerKey`
- `pendingId`
- `actionId`

then `adapter-feishu` can resolve the pending record and forward a provider-scoped callback turn through `POST /providers/card-action`.

## Intentionally not implemented yet

The following path remains blocked by external API reality and is therefore **not** exposed as a supported integration contract:

```text
alert -> adapter-feishu -> warning-agent submitAlert/report poll -> Feishu
```

This repository keeps that boundary honest until `warning-agent` exposes a stable external alert/report API.
