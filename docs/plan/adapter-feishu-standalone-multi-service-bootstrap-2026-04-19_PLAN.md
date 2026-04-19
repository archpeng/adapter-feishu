# adapter-feishu standalone multi-service bootstrap plan

- plan_id: `adapter-feishu-standalone-multi-service-bootstrap-2026-04-19`
- plan_class: `execution-plan`
- status: `completed`
- mode: `autopilot-control-plane`
- predecessor_plan: `none`
- last_updated: `2026-04-20`

## 1. Goal

把 `adapter-feishu` 建成一个**独立仓库、独立部署、可服务多个后端系统**的 Feishu/Lark 适配层。

它的第一阶段目标固定为：

```text
Feishu ingress / alert ingress
  -> provider-neutral adapter core
  -> provider router
  -> backend-specific provider
  -> Feishu card / message delivery
```

第一优先接入后端：

- `warning-agent`

但核心设计必须从第一天起支持：

- 多 provider 注册
- 多服务复用同一 Feishu 通道层
- provider 之间相互隔离

## 2. Product stance

`adapter-feishu` 的定位固定为：

> 独立的 Feishu host / channel service  
> 负责接入、路由、投递、回调与最小状态管理；  
> 不负责诊断真相，不负责长期记忆，不负责 agent runtime 主脑。

因此它：

- 是 `channel / host adapter`
- 不是 `warning-agent`
- 不是 `Boston-Bot runtime`
- 不是 `bb-memory / governance` 的替代品
- 不是通用 chat bot 平台

## 3. Hard freeze policy

### 3.1 Core freeze

本 pack 生效后，以下事项固定冻结，不得作为主线推进：

- 不把 `@boston-bot/openai-agents-runtime` 搬进本仓作为核心依赖
- 不把 `codex_diagnose / codex_fix` 或类似工具编排移植进 adapter core
- 不把任一 provider 的业务判断逻辑写进 Feishu 通道层
- 不让 adapter 持有长期 incident truth / diagnosis truth
- 不让 adapter 直接演化成通用 agent shell

允许的仅限：

- provider contract
- Feishu ingress / egress
- routing / callback / dedupe / pending-action 最小状态
- provider-specific integration code placed under `src/providers/**`

### 3.2 Warning-agent freeze

`warning-agent` 是首个 provider，但不是核心真相源替代对象。

因此在本 pack 内：

- 不把 `warning-agent` 专有字段偷渡进 core contracts
- 不让 `warning-agent` 的当前临时接口直接定义 adapter 全局架构
- 不在 provider contract 未冻结前，先写 warning-agent-only 实现

## 4. Why this successor exists

当前现实边界已经明确：

- 远程仓库 `adapter-feishu` 已存在，但本地/远程当前基本为空壳
- `boston-bot-vp/apps/feishu-adapter` 已有可参考的 Feishu host shell
- 但该实现当前强耦合：
  - `@boston-bot/openai-agents-runtime`
  - `codex_diagnose / codex_fix`
  - `bb-memory / govern` substrate wiring
- `warning-agent` 当前已经能产出：
  - webhook runtime receipt
  - packet / decision / optional investigation
  - final markdown report
- 但 `warning-agent` 还没有一个专门面向外部 notifier 的稳定 report-delivery API

因此本 pack 的核心不是“复制 Boston-Bot Feishu adapter”，而是：

> 提取其可复用的 Feishu host shell，  
> 并为独立、多 provider、warning-agent-first 集成建立正确边界。

## 5. Scope

### in scope

- 独立 repo scaffold
- Feishu webhook / long-connection ingress
- Feishu message / card egress
- provider-neutral contracts
- provider registry / routing
- `warning-agent` 作为第一个 provider
- 最小 pending callback / dedupe / delivery state
- runbook / tests / packaging baseline

### out of scope

- 通用 agent runtime
- 内置 LLM orchestration
- Bash / file / shell tools in adapter core
- 长期 memory / governance brain
- 复杂 multi-tenant control plane
- 直接实现所有 provider；只要求架构支持多个 provider

## 6. Deliverables

1. **Standalone repo baseline**
   - `README`, `package.json`, `tsconfig`, `.env.example`, `src/`, `test/`
2. **Feishu channel core**
   - webhook / long-connection / client / reply sink / cards
3. **Provider-neutral core**
   - contracts / registry / router / minimal state store
4. **Warning-agent provider**
   - notify-first integration
   - warning-agent payload normalization + card rendering
5. **Optional alert-forward path**
   - only if warning-agent exposes a stable alert/report handshake surface
6. **Verification + ops baseline**
   - unit / integration / host tests
   - Docker / runbook / local dev flow

## 7. Verification ladder

1. unit tests for contracts, normalization, routing, card rendering
2. provider integration tests with warning-agent fixtures/mocks
3. webhook host tests
4. long-connection host tests
5. end-to-end notify path against a fake warning-agent provider
6. `npm test`
7. `npm run build`

## 8. Execution outline

| Slice | Summary | Primary outcome |
|---|---|---|
| `S1` | repo bootstrap + architecture/boundary freeze | no ambiguity about what adapter-feishu is and is not |
| `S2` | Feishu channel core extraction | reusable host shell exists without Boston-Bot runtime coupling |
| `S3` | provider-neutral contracts + router | multiple providers can be registered cleanly |
| `S4` | warning-agent notify-first provider | warning-agent can push completed analysis/report into Feishu delivery path |
| `S5` | callback / pending state / optional alert-forward path | safe interaction loop and bounded escalation path |
| `S6` | packaging / runbook / release baseline | repo can be run, tested, and handed off honestly |

## 9. Detailed implementation checklist

### `S1` — repo bootstrap + architecture/boundary freeze

**Files / surfaces**

- `README.md`
- `.gitignore`
- `.env.example`
- `package.json`
- `tsconfig.json`
- `vitest.config.ts`
- `src/core/contracts.ts`
- `src/config.ts`
- `docs/architecture/adapter-feishu-architecture.md` (new)
- `docs/plan/*`

**Change / add surfaces**

- define core nouns:
  - `DeliveryChannel`
  - `InboundTurn`
  - `ProviderKey`
  - `ProviderNotification`
  - `ProviderAlertSubmission`
  - `ProviderDeliveryResult`
- define repo boundary:
  - Feishu host shell only
  - provider-neutral core
  - provider-specific integration under `src/providers/**`

**Minimal tests**

- config loads minimal env
- core contract examples typecheck
- architecture doc and README agree on repo boundary

**done_when**

- repo can compile as an empty scaffold
- there is a stable statement of product boundary
- future execution no longer depends on Boston-Bot repo semantics

**stop boundary**

- do not yet implement Feishu network calls
- do not yet implement warning-agent provider logic

---

### `S2` — Feishu channel core extraction

**Files / surfaces**

- `src/channels/feishu/client.ts`
- `src/channels/feishu/webhook.ts`
- `src/channels/feishu/longConnection.ts`
- `src/channels/feishu/replySink.ts`
- `src/channels/feishu/webhookSecurity.ts`
- `src/channels/feishu/types.ts`
- `src/cards/templates.ts`
- `test/channels/*`

**Change / add functions**

- `createFeishuClient(config)`
  - tenant token acquisition + message/card send
- `createWebhookServer(config, handler)`
  - Feishu webhook ingress
- `createLongConnectionIngress(config, handler)`
  - Feishu long connection ingress
- `createReplySink(client)`
  - provider result -> Feishu text/card delivery
- `renderTextCard(...)`
- `renderInteractiveCard(...)`

**Minimal tests**

- webhook token/signature verification
- reply sink sends expected card payload
- long-connection event normalization works

**done_when**

- Feishu ingress/egress works without any Boston-Bot runtime dependency
- channel core only depends on generic contracts

**stop boundary**

- do not yet wire provider registry
- do not yet add warning-agent-specific mapping

---

### `S3` — provider-neutral contracts + router

**Files / surfaces**

- `src/providers/contracts.ts`
- `src/providers/registry.ts`
- `src/providers/router.ts`
- `src/state/dedupe.ts`
- `src/state/pendingStore.ts`
- `src/app.ts`
- `test/providers/*`

**Change / add functions**

- `registerProvider(definition)`
  - input: provider definition
  - output: provider registry entry
- `routeInboundTurn(turn)`
  - input: normalized inbound turn / alert / callback
  - output: selected provider + provider action
- `PendingStore`
  - bounded state for approval/callback continuation
- `AlertDeduper`
  - bounded TTL dedupe for alert ingestion

**Provider contract**

mandatory:

- `providerKey`
- `supportsNotification(payload)`
- `deliverNotification(payload, context)`

optional:

- `supportsAlertSubmission(payload)`
- `submitAlert(payload, context)`
- `handleCallback(payload, context)`

**Minimal tests**

- multiple providers can register without cross-coupling
- router selects provider by key / payload shape / configured mapping
- pending callback state stays provider-scoped

**done_when**

- core can host more than one provider
- provider-specific logic no longer leaks into channel shell

**stop boundary**

- no direct warning-agent network calls yet

---

### `S4` — warning-agent notify-first provider

**Files / surfaces**

- `src/providers/warning-agent/contracts.ts`
- `src/providers/warning-agent/client.ts`
- `src/providers/warning-agent/normalize.ts`
- `src/providers/warning-agent/cards.ts`
- `src/providers/warning-agent/index.ts`
- `test/providers/warning-agent/*`

**Change / add functions**

- `normalizeWarningAgentNotification(payload)`
  - input: warning-agent completed analysis/report payload
  - output: provider-neutral notification contract
- `renderWarningAgentDiagnosisCard(payload)`
  - input: warning-agent normalized result
  - output: Feishu card payload
- `WarningAgentProvider.deliverNotification(payload, context)`
  - input: warning-agent notification
  - output: Feishu delivery action

**Integration stance**

first phase is fixed to:

```text
warning-agent -> adapter-feishu -> Feishu
```

not:

```text
Feishu/alert -> adapter-feishu -> orchestrate warning-agent internals
```

**Minimal tests**

- warning-agent payload maps to stable diagnosis card
- provider can deliver both short text and rich card forms
- provider does not require warning-agent repo-local filesystem access

**done_when**

- adapter can serve warning-agent as first provider without infecting core contracts
- warning-agent integration is delivery-oriented and honest about current API boundary

**stop boundary**

- do not yet force alert-forward orchestration if warning-agent lacks stable external API

---

### `S5` — callback / pending state / optional alert-forward path

**Files / surfaces**

- `src/server/providerWebhook.ts`
- `src/server/cardAction.ts`
- `src/providers/warning-agent/submitAlert.ts` (optional)
- `src/providers/warning-agent/reportPoller.ts` (optional)
- `test/server/*`

**Change / add functions**

- `handleProviderWebhook(payload)`
  - input: provider push notification / callback
  - output: routed provider action
- `handleCardAction(payload)`
  - input: Feishu interactive callback
  - output: provider-scoped callback continuation
- `WarningAgentProvider.submitAlert(...)`
  - input: alert payload
  - output: warning-agent job receipt / report ref
- `WarningAgentProvider.fetchReport(...)`
  - input: report id / runtime id
  - output: deliverable report payload

**External dependency rule**

This slice is only executable if warning-agent exposes one of:

- synchronous completed report response
- stable `GET /report/{id}` style pull API
- stable push notification contract back into adapter-feishu

If none exists, stop and replan rather than inventing hidden coupling.

**Minimal tests**

- callback resolution stays provider-scoped
- pending state expires safely
- alert-forward path remains optional and feature-flagged

**done_when**

- adapter can support interaction loops safely
- warning-agent path is either honestly blocked or cleanly integrated

**stop boundary**

- do not yet add non-warning-agent providers

---

### `S6` — packaging / runbook / release baseline

**Files / surfaces**

- `Dockerfile`
- `README.md`
- `docs/runbook/adapter-feishu-local-runbook.md` (new)
- `docs/runbook/adapter-feishu-provider-integration.md` (new)
- `.github/workflows/*` (optional if repo policy permits)

**Change / add functions**

- `health` endpoint
- local startup scripts or `npm` scripts
- example provider config mapping

**Minimal tests**

- build passes from clean checkout
- local webhook mode can start
- local long-connection mode can start with env gated

**done_when**

- repo is runnable as a standalone service
- operator can onboard warning-agent as first provider from docs alone
- closeout can state honest boundaries for multi-provider support

## 10. Open dependencies

1. `warning-agent` currently lacks a dedicated external report-delivery API; provider-first integration should start with a notify-first contract.
2. exact Feishu callback / card interaction shape may require one more contract freeze once the first provider payload is fixed.
3. if future providers require approvals, approval state must remain provider-scoped and bounded.

## 11. Closeout criteria

This pack may only close as `completed` when all of the following are true:

- standalone repo scaffold exists
- Feishu host shell runs independently of Boston-Bot runtime
- provider-neutral contracts are landed
- warning-agent provider can deliver real provider payload into Feishu
- tests and runbooks support honest local execution

Until then, remaining work must be tracked through this `PLAN / STATUS / WORKSET` pack rather than implicit repo drift.
