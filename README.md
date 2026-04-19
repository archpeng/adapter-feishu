# adapter-feishu

`adapter-feishu` is a **standalone Feishu/Lark channel service**.

Its first delivery path is fixed to:

```text
warning-agent -> adapter-feishu -> Feishu/Lark
```

But the core architecture is frozen from day one as:

```text
Feishu ingress / alert ingress
  -> provider-neutral adapter core
  -> provider router
  -> backend-specific provider
  -> Feishu card / message delivery
```

## Product boundary

This repository exists to host Feishu/Lark ingress, routing, delivery, callbacks, and minimal short-lived state.

It is intentionally **not** any of the following:

- warning-agent itself
- Boston-Bot runtime
- a general-purpose agent shell
- a long-term incident truth store
- a bash/file/tool orchestration host

Boundary anchors frozen for this repo:

- standalone Feishu/Lark channel service
- provider-neutral adapter core
- provider-specific integrations live under `src/providers/**`
- Boston-Bot runtime is not the adapter core

## What is in scope

- Feishu webhook / long-connection ingress
- Feishu message and card delivery
- provider registry and routing
- provider-neutral contracts
- minimal pending callback and dedupe state
- provider integrations under `src/providers/**`
- `warning-agent` as the first provider

## What is out of scope

- embedded diagnosis or agent orchestration logic in channel core
- importing `@boston-bot/openai-agents-runtime` as core runtime
- hard-coding warning-agent-only fields into shared contracts
- long-term memory, governance brain, or incident ownership
- pretending the repo is already a multi-tenant control plane

## Current implementation state

Active planning pack:

- `docs/plan/adapter-feishu-standalone-multi-service-bootstrap-2026-04-19_PLAN.md`
- `docs/plan/adapter-feishu-standalone-multi-service-bootstrap-2026-04-19_STATUS.md`
- `docs/plan/adapter-feishu-standalone-multi-service-bootstrap-2026-04-19_WORKSET.md`

Current repo truth:

- standalone runtime bootstrap is landed through `src/runtime.ts` and `src/main.ts`
- provider routing, bounded dedupe, and pending callback state are landed under `src/providers/**` and `src/state/**`
- provider webhook, card-action dispatch, and health routing are landed under `src/server/**`
- the first concrete provider path is notify-first `warning-agent -> adapter-feishu -> Feishu/Lark`
- the remaining blocked path is alert-forward orchestration, which stays out of scope until `warning-agent` exposes a stable external alert/report API

## Repository layout

```text
src/
  app.ts                     ingress mode bootstrap + provider-routing seam for the standalone host
  config.ts                  configuration loading for the standalone host
  runtime.ts                 standalone runtime composition for HTTP host + long-connection ingress
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
  server/
    httpHost.ts              health + route dispatch for standalone HTTP mode
    providerWebhook.ts       notify-first provider webhook dispatch
    cardAction.ts            provider-scoped card-action callback dispatch
  cards/templates.ts         generic Feishu card rendering helpers
  channels/feishu/
    client.ts                tenant token + message/card send client
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

test/
  app.test.ts
  runtime.test.ts
  config.test.ts
  contracts.test.ts
  docs-boundary.test.ts
  cards/templates.test.ts
  channels/feishu/*.test.ts
  providers/*.test.ts
  providers/warning-agent/*.test.ts
  server/*.test.ts
  state/*.test.ts
```

Remaining extension surface:

- additional providers under `src/providers/**`
- optional alert-forward integration once a stable external provider API exists

## Getting started

1. Install dependencies:
   - `npm install`
2. Copy env template:
   - `cp .env.example .env`
3. Fill in the minimum Feishu settings.
4. Run verification:
   - `npm run build`
   - `npm test`

## Architecture references

- `docs/architecture/adapter-feishu-architecture.md`
- `docs/plan/adapter-feishu-standalone-multi-service-bootstrap-2026-04-19_PLAN.md`

## License

See `LICENSE`.
