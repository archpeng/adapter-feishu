# adapter-feishu

`adapter-feishu` is a **standalone Feishu/Lark channel service**.

Today it exposes two bounded integration paths:

```text
warning-agent -> adapter-feishu -> Feishu/Lark
business payload -> POST /providers/form-webhook -> Feishu Base/Bitable record write
```

The core architecture remains frozen as:

```text
Feishu ingress / alert ingress
  -> provider-neutral adapter core
  -> provider router
  -> backend-specific provider
  -> Feishu card / message delivery
```

## Product boundary

This repository exists to host Feishu/Lark ingress, routing, delivery, callbacks, minimal short-lived state, and bounded Feishu Base record-write integration.

It is intentionally **not** any of the following:

- warning-agent itself
- Boston-Bot runtime
- a general-purpose agent shell
- a long-term incident truth store
- a bash/file/tool orchestration host
- a full smart-form control plane

Boundary anchors frozen for this repo:

- standalone Feishu/Lark channel service
- provider-neutral adapter core
- provider-specific integrations live under `src/providers/**`
- Boston-Bot runtime is not the adapter core
- form webhook support is bounded to **existing Base/table record writes** plus optional schema preflight

## What is in scope

- Feishu webhook / long-connection ingress
- Feishu message and card delivery
- provider registry and routing
- provider-neutral contracts
- minimal pending callback and dedupe state
- provider integrations under `src/providers/**`
- `warning-agent` as the first provider
- provider webhook auth for backend-to-adapter pushes
- `POST /providers/form-webhook` for existing Feishu Base/Bitable record writes
- optional form-schema preflight via existing `formId`

## What is out of scope

- embedded diagnosis or agent orchestration logic in channel core
- importing `@boston-bot/openai-agents-runtime` as core runtime
- hard-coding warning-agent-only fields into shared contracts
- long-term memory, governance brain, or incident ownership
- pretending the repo is already a multi-tenant control plane
- creating Base/table/form resources from adapter-feishu
- full smart-form submission emulation, form patching, field auto-create, attachment upload, or cross-instance write serialization

## Current implementation state

There is currently **no active planning pack** in `docs/plan/*`.

Closed/archived plan packs:

- latest closed pack:
  - `docs/archive/plan/adapter-feishu-form-webhook-poc-v1-2026-04-23_PLAN.md`
  - `docs/archive/plan/adapter-feishu-form-webhook-poc-v1-2026-04-23_STATUS.md`
  - `docs/archive/plan/adapter-feishu-form-webhook-poc-v1-2026-04-23_WORKSET.md`
  - `docs/archive/plan/adapter-feishu-form-webhook-poc-v1-2026-04-23_CLOSEOUT.md`
- archived predecessor pack:
  - `docs/archive/plan/adapter-feishu-standalone-multi-service-bootstrap-2026-04-19_PLAN.md`
  - `docs/archive/plan/adapter-feishu-standalone-multi-service-bootstrap-2026-04-19_STATUS.md`
  - `docs/archive/plan/adapter-feishu-standalone-multi-service-bootstrap-2026-04-19_WORKSET.md`
- live placeholder/control-plane entry:
  - `docs/plan/README.md`

Current repo truth:

- standalone runtime bootstrap is landed through `src/runtime.ts` and `src/main.ts`
- provider routing, bounded dedupe, and pending callback state are landed under `src/providers/**` and `src/state/**`
- provider webhook, card-action dispatch, health routing, and `/providers/form-webhook` are landed under `src/server/**`
- the first concrete provider path remains notify-first `warning-agent -> adapter-feishu -> Feishu/Lark`
- the new form path writes records into an **existing** Feishu Base/table through `bitable.appTableRecord.create`
- optional schema preflight uses `bitable.appTableForm.get` + `bitable.appTableFormField.list`
- same-table write safety is intentionally **in-process only** and scoped by `appToken:tableId`
- the repo still does **not** claim full smart-form control or generic form lifecycle management

## Form webhook quick start

1. Install dependencies:
   - `npm install`
2. Copy env template:
   - `cp .env.example .env`
3. Fill in at least:
   - `FEISHU_APP_ID`
   - `FEISHU_APP_SECRET`
   - `ADAPTER_FEISHU_FORM_WEBHOOK_AUTH_TOKEN`
   - `ADAPTER_FEISHU_FORM_DEFAULT_APP_TOKEN`
   - `ADAPTER_FEISHU_FORM_DEFAULT_TABLE_ID`
   - optional: `ADAPTER_FEISHU_FORM_DEFAULT_FORM_ID`
4. Start the service:
   - `npm run build`
   - `npm run start`
5. Send a record-write request:

```bash
curl -X POST http://127.0.0.1:8787/providers/form-webhook \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer form-token-1' \
  -d '{
    "clientToken": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "fields": {
      "Title": "adapter-feishu",
      "Severity": "warning"
    }
  }'
```

Bounded payload rules:

- `clientToken` must be UUIDv4
- `fields` must be a JSON object and should match real table column names
- `validateFormSchema` is optional
- `target` is only accepted when `ADAPTER_FEISHU_FORM_ALLOW_TARGET_OVERRIDE=true`
- if `validateFormSchema=true`, the resolved target must include a usable `formId`

Typical success shape:

```json
{
  "code": 0,
  "status": "record_created",
  "recordId": "rec_xxx",
  "clientToken": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "targetSource": "default",
  "target": {
    "appToken": "bascnxxxxxxxxxxxx",
    "tableId": "tblxxxxxxxxxxxx",
    "formId": "formxxxxxxxxxxxx"
  }
}
```

For the full contract, auth rules, override behavior, schema-validation errors, and troubleshooting, see:

- `docs/runbook/adapter-feishu-form-integration.md`

## Repository layout

```text
src/
  app.ts                     ingress mode bootstrap + provider-routing seam for the standalone host
  config.ts                  configuration loading for the standalone host, including form-webhook env contract
  runtime.ts                 standalone runtime composition for HTTP host + long-connection ingress + form webhook deps
  main.ts                    process entrypoint for local/service startup
  core/contracts.ts          provider-neutral core nouns and payloads
  providers/
    contracts.ts             shared provider hooks and execution context
    registry.ts              enabled-provider registration and lookup
    router.ts                explicit/default provider resolution
    warning-agent/
      contracts.ts           warning-agent payload contract + type guard
      normalize.ts           warning-agent -> shared notification mapping
      cards.ts               warning-agent diagnosis card rendering helper
      client.ts              notify-first report fetch helper
      index.ts               warning-agent provider definition
  state/
    dedupe.ts                bounded provider-scoped dedupe window
    pendingStore.ts          bounded provider-scoped pending callback state
    tableWriteQueue.ts       bounded in-process same-table record-write serialization
  server/
    httpHost.ts              health + route dispatch for standalone HTTP mode
    providerWebhook.ts       notify-first provider webhook dispatch
    formWebhook.ts           bounded Feishu Base/form-backed record-write ingress
    cardAction.ts            provider-scoped card-action callback dispatch
  cards/templates.ts         generic Feishu card rendering helpers
  channels/feishu/
    client.ts                tenant token + message/card send client
    bitableClient.ts         Feishu Bitable wrapper seam for record write + form metadata reads
    longConnection.ts        long-connection ingress shell
    replySink.ts             provider notification -> Feishu delivery sink
    types.ts                 shared Feishu ingress/egress types + normalization
    webhook.ts               Feishu webhook ingress server + dispatch
    webhookSecurity.ts       token/signature verification helpers
  index.ts                   public exports for scaffold + channel shell

docs/
  architecture/adapter-feishu-architecture.md
  runbook/adapter-feishu-local-runbook.md
  runbook/adapter-feishu-provider-integration.md
  runbook/adapter-feishu-warning-agent-onboarding.md
  runbook/adapter-feishu-form-integration.md

test/
  app.test.ts
  runtime.test.ts
  config.test.ts
  contracts.test.ts
  cards/templates.test.ts
  channels/feishu/*.test.ts
  providers/*.test.ts
  providers/warning-agent/*.test.ts
  server/*.test.ts
  state/*.test.ts
```

## Getting started

1. Install dependencies:
   - `npm install`
2. Copy env template:
   - `cp .env.example .env`
3. Fill in the minimum Feishu settings for the path you are testing.
4. Run verification:
   - `npm run verify`
5. Optional real Feishu smoke test for the provider-webhook path:
   - set `ADAPTER_FEISHU_SMOKE_CHAT_ID` or `ADAPTER_FEISHU_SMOKE_OPEN_ID`
   - run `npm run smoke:provider-webhook`

## Architecture references

- `docs/architecture/adapter-feishu-architecture.md`
- `docs/plan/README.md`
- `docs/archive/plan/adapter-feishu-form-webhook-poc-v1-2026-04-23_CLOSEOUT.md`
- `docs/runbook/adapter-feishu-provider-integration.md`
- `docs/runbook/adapter-feishu-form-integration.md`
- `docs/runbook/adapter-feishu-warning-agent-onboarding.md`

## License

See `LICENSE`.
