# adapter-feishu architecture

## 1. Frozen product statement

`adapter-feishu` is a **standalone Feishu/Lark channel service**.

Its responsibility is bounded to:

- Feishu/Lark ingress
- provider routing
- Feishu message/card delivery
- callback handling
- minimal short-lived adapter state

It does **not** own diagnosis truth, long-term memory, or agent-runtime orchestration.

Boundary anchors frozen for this repo:

- standalone Feishu/Lark channel service
- provider-neutral adapter core
- provider-specific integrations live under `src/providers/**`
- Boston-Bot runtime is not the adapter core

## 2. First-phase architecture

```text
Feishu ingress / alert ingress
  -> provider-neutral adapter core
  -> provider router
  -> backend-specific provider
  -> Feishu card / message delivery
```

First concrete integration:

```text
warning-agent -> adapter-feishu -> Feishu/Lark
```

The warning-agent path is important, but it must not define the global core contract by accident.

## 3. Explicit non-goals

The following are frozen out of scope for the adapter core:

- importing Boston-Bot runtime as the adapter core
- embedding diagnosis or generic agent loops into the channel layer
- adding bash/file/tool orchestration to this service
- storing long-term incident truth or memory truth here
- leaking provider-specific payload fields into shared contracts

## 4. Module ownership

### 4.1 Channel shell

Current path:

- `src/app.ts`
- `src/cards/templates.ts`
- `src/channels/feishu/**`

Owns:

- Feishu webhook normalization
- long-connection ingress normalization
- Feishu client
- reply sink
- app-level seam that hands normalized turns into provider-routing abstractions
- card templates

Must not own:

- provider business rules
- diagnosis logic
- warning-agent-only payload semantics

### 4.2 Core

Current path:

- `src/core/contracts.ts`
- `src/config.ts`

Owns:

- provider-neutral nouns
- shared delivery and routing payload shapes
- config loading for standalone deployment

### 4.3 Providers

Current shared path:

- `src/providers/contracts.ts`
- `src/providers/registry.ts`
- `src/providers/router.ts`

Current concrete-provider path:

- `src/providers/warning-agent/**`

Future concrete-provider path:

- `src/providers/**`

Shared provider layer owns:

- provider-facing contracts
- enabled-provider registration and lookup
- explicit/default provider resolution

Each concrete provider owns:

- provider-specific payload normalization
- provider-specific delivery mapping
- provider-scoped callback handling

Shared rule:

- provider-specific integrations live under `src/providers/**`

### 4.4 State

Current path:

- `src/state/dedupe.ts`
- `src/state/pendingStore.ts`

Owns only bounded adapter state such as:

- dedupe windows
- pending callback state
- short-lived delivery bookkeeping

### 4.5 Runtime and standalone HTTP host

Current path:

- `src/runtime.ts`
- `src/main.ts`
- `src/server/httpHost.ts`
- `src/server/providerWebhook.ts`
- `src/server/cardAction.ts`

Owns:

- standalone HTTP host bootstrap
- health routing
- provider webhook dispatch
- provider-scoped card-action dispatch
- composition of provider registry, router, reply sink, dedupe, and pending state

Must not own:

- provider-specific business rules beyond composition
- long-term workflow truth
- hidden coupling to warning-agent repo-local state

## 5. Core nouns frozen in S1

The bootstrap slice freezes these shared nouns before real network implementation begins:

- `DeliveryChannel`
- `InboundTurn`
- `ProviderKey`
- `ProviderNotification`
- `ProviderAlertSubmission`
- `ProviderDeliveryResult`

Interpretation guidance:

- `InboundTurn` is the normalized inbound surface from Feishu or future callback paths.
- `ProviderNotification` is the provider-to-adapter delivery payload for already-computed results.
- `ProviderAlertSubmission` is the adapter-to-provider alert-forward contract, kept optional until an external API is stable.
- `ProviderDeliveryResult` is the adapter-side record of what happened after routing and delivery.

## 6. Routing policy

Routing must stay provider-neutral:

1. normalize inbound event
2. resolve provider by explicit provider key when override is allowed, otherwise fall back to the configured default provider
3. invoke only that provider
4. emit Feishu delivery through the channel layer
5. keep callback and pending state provider-scoped

No provider may smuggle new core requirements through undocumented fields.

## 7. Execution order

- `S1` scaffold + boundary freeze
- `S2` Feishu channel extraction without Boston-Bot runtime coupling
- `S3` provider registry/router
- `S4` warning-agent notify-first provider
- `S5` callback state + optional alert-forward path
- `S6` packaging/runbook/release baseline

## 8. Verification contracts

### `S1` bootstrap slice

`S1` is only honest when all of the following are true:

- the repo builds as a standalone TypeScript scaffold
- config loading is covered by targeted tests
- the frozen core nouns compile in contract examples
- README and architecture docs state the same boundary

### `S2` channel extraction slice

`S2` is only honest when all of the following are true:

- webhook challenge and signature checks are covered by targeted tests
- long-connection ingress normalizes message events into `InboundTurn`
- reply sink can deliver both plain text and interactive-card notifications
- the extracted channel shell depends on local config + generic contracts, not Boston-Bot runtime

Only after those checks pass should `S3` provider routing begin.
