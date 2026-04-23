# adapter-feishu form webhook poc v1 plan

- plan_id: `adapter-feishu-form-webhook-poc-v1-2026-04-23`
- plan_class: `execution-plan`
- status: `ready`
- mode: `autopilot-control-plane`
- predecessor_plan: `adapter-feishu-standalone-multi-service-bootstrap-2026-04-19`
- last_updated: `2026-04-23`

## Goal

在 `adapter-feishu` 中落一个**完整但收敛的 POC v1**：

```text
POST /providers/form-webhook
  -> auth / parse / target resolve / optional dedupe
  -> Feishu Base(Bitable) record create
  -> return record_id / bounded error surface
```

本 pack 的产品落点固定为：

- 写入**已有** Feishu Base / table 的记录
- 可选地对**已有** form 做 schema preflight
- 为后续“控制表单元数据 / 问题项 / form 视图”保留 client seam
- 不把当前 repo 的消息投递 core 强行改造成通用 form orchestration core

## Scope

- `src/channels/feishu/bitableClient.ts`：基于 `@larksuiteoapi/node-sdk` 的 Bitable client seam
- `src/server/formWebhook.ts`：新 ingress dispatcher
- `src/server/httpHost.ts` / `src/runtime.ts`：route + runtime wiring
- `src/config.ts` / `.env.example`：POC v1 所需配置
- `src/state/**`：如需要，增加 table-scoped serialized write queue
- `test/channels/feishu/bitableClient.test.ts`
- `test/server/formWebhook.test.ts`
- `test/server/httpHost.test.ts`
- `test/runtime.test.ts`
- `docs/runbook/adapter-feishu-form-integration.md`
- `README.md`

## Non-Goals

- 不在本 pack 内做通用 provider-neutral form core
- 不实现任意 Base / table / field / form 的全动态创建器
- 不实现附件上传闭环
- 不实现复杂 mapping DSL / JSONPath engine
- 不把“写 backing table record”伪装成完整“模拟终端用户提交表单”语义
- 不改写当前 `ProviderNotification` / `ProviderDeliveryResult` 共享名词去承载 Base 写入
- 不在本 pack 内做 release / CI / deployment hardening beyond local verification

## Deliverables

1. **Feishu Bitable client seam**
   - `createRecord(...)`
   - `getForm(...)`
   - `listFormFields(...)`
2. **Form webhook ingress**
   - `POST /providers/form-webhook`
   - 独立 auth token
   - 统一 success / validation / downstream error shape
3. **POC target + safety contract**
   - default target config
   - bounded target override policy
   - local dedupe / client token / serialized write boundary
4. **Verification baseline**
   - targeted tests for client / server / routing / runtime
   - runbook + env + example request

## Constraints

- 保持当前消息/卡片 delivery path 不回归：`/providers/webhook`、`/providers/card-action`、`/webhook` 必须保持原有边界
- POC v1 默认把“写 record”作为主路径；form metadata / form field control 仅保留 seam，不作为交付主线
- Feishu 文档已明确：同一个 `table` 不支持并发写接口调用；若需要并发保护，必须在 adapter 内体现 table-scoped serialization
- `client_token` 走 uuidv4 语义，不允许把脆弱业务字符串直接伪装为 Feishu idempotency token
- 人员字段默认优先 `user_id` 语义，避免跨应用 `open_id` 混用
- auth 必须与现有 provider notify webhook 分开，避免 record-write surface 与 message-delivery surface 共用权限边界
- 不引入 repo 外第二套 plan/control-plane mirror；`docs/plan/*` 保持单一机器真相

## Verification

1. `test/channels/feishu/bitableClient.test.ts`
2. `test/server/formWebhook.test.ts`
3. `test/server/httpHost.test.ts`
4. `test/runtime.test.ts`
5. `test/config.test.ts`
6. targeted `npm test -- <files>`
7. full `npm run verify`

## Blockers / Risks

1. Feishu 应用权限与 Base 文档应用权限若未提前配置，POC 代码即使正确也会返回 `permission denied`
2. 字段名与实际 Base schema 不一致时，record create 会触发 `FieldNameNotFound` 或字段类型错误
3. 若 `form_id` 不可用，则 schema preflight 只能退化为 table-level record write；不得谎称完整 form semantic parity
4. 当前 repo 工作区已有未提交改动；执行时必须避免误覆盖用户现有脏变更
5. 若 SDK 类型面与 repo 的 ESM/TypeScript 约束冲突，优先保持本地 wrapper seam 简单而非把 runtime 直接绑死在 SDK 细节上

## Slice Definitions

#### `FW1.S1` — bitable client + config/auth contract freeze

- Owner: `execute-plan`
- State: `READY`
- Priority: `highest`

目标：

- 落地 Feishu Base/Bitable client seam 与配置边界，确保后续 server slice 不直接把 SDK 细节撒进 runtime

交付物：

1. `src/channels/feishu/bitableClient.ts`，封装 `createRecord / getForm / listFormFields`
2. `src/config.ts` 与 `.env.example` 中的 form webhook / default target / override policy 配置
3. `test/channels/feishu/bitableClient.test.ts` 与必要的 `test/config.test.ts` 覆盖

done_when:

1. wrapper 能以 mocked SDK / deps 证明 `createRecord` 正确传递 `app_token`、`table_id`、`client_token`、`user_id_type`
2. config 明确区分 message delivery webhook auth 与 form webhook auth
3. 当前 slice 完成后，server/runtime 不需要自行拼 Bitable HTTP endpoint 或 SDK payload 细节
4. shared core contracts 未被 form POC 语义污染

stop_boundary:

1. 本 slice 不实现 HTTP route，不把 server dispatch 与 client seam 混在同一提交块里扩写
2. 不在本 slice 内引入复杂 schema validation / queue / attachment 支持
3. 若发现必须改动现有 provider-neutral core nouns 才能前进，停止并 replan，不要硬塞进 `src/core/contracts.ts`

必须避免：

1. 直接在 `runtime.ts` 中内联 SDK 调用
2. 复用 `ProviderNotification` 语义去表示 Base record write
3. 让配置同时支持过多 target registry/mapping 模式，导致 POC contract 失真

#### `FW1.S2` — form webhook ingress + write path

- Owner: `execute-plan`
- State: `queued`
- Priority: `high`

目标：

- 增加 `POST /providers/form-webhook`，完成 auth / parse / target resolve / dedupe / createRecord 主链路

交付物：

1. `src/server/formWebhook.ts`
2. `src/server/httpHost.ts` route wiring
3. `src/runtime.ts` dependency wiring
4. `test/server/formWebhook.test.ts`、`test/server/httpHost.test.ts`、必要的 `test/runtime.test.ts`

done_when:

1. `/providers/form-webhook` 对 unauthorized / invalid_json / invalid_payload / downstream failure / success 都有稳定响应
2. success path 能返回 `recordId` 或至少返回明确 `record_created` 状态与关联 token
3. raw target 与 default target 的优先级清晰，且 override 行为受 config 控制
4. existing `/providers/webhook`、`/providers/card-action`、`/webhook` 路由不回归

stop_boundary:

1. 本 slice 不扩写到 form metadata patch / form field patch / form view create
2. 若 target registry 设计仍不清晰，先固定为 default target + optional override，不发明通用 registry DSL
3. 不把该接口伪装成“完整表单提交模拟器”

必须避免：

1. 与现有 provider notify webhook 共用 auth token 且无明确说明
2. 把 downstream SDK/raw error 原样泄露成不稳定外部 contract
3. 在未验证 route 回归前顺手改动其他 HTTP surfaces

#### `FW1.S3` — schema preflight + serialized write safety

- Owner: `execute-plan`
- State: `queued`
- Priority: `high`

目标：

- 在不扩大 scope 的前提下补足 POC v1 的“像表单而不只是写表”的最低安全面：可选 schema preflight 与 same-table serialization

交付物：

1. `validateFormSchema` 可选路径，使用 `getForm / listFormFields`
2. table-scoped serialized write queue（若实现需要）
3. 覆盖必填字段缺失、不可见/未知字段边界、同表串行写保护的测试

done_when:

1. 开启 `validateFormSchema` 时，缺少 required form fields 会被 adapter 在写前拒绝
2. 代码与文档明确同一 `appToken:tableId` 写请求的串行边界
3. queue/safety 设计不引入长期状态，只保留 bounded in-process protection

stop_boundary:

1. 不实现附件上传、字段自动创建、选项自动扩容
2. 不因 preflight 需求去接入完整 form metadata mutation surface
3. 若 form_id 缺失或 Feishu API 现实不支持某场景，只做 honest degrade，不要伪造 validation completeness

必须避免：

1. 把所有 field typing 规则都手工复制成庞大本地 schema engine
2. 为了“看起来完整”而扩到 form patch/view create

#### `FW1.S4` — docs + verification + closeout baseline

- Owner: `execute-plan`
- State: `queued`
- Priority: `medium`

目标：

- 让 POC v1 可以被 honest handoff：如何配置、如何调用、知道哪些能力已支持/未支持

交付物：

1. `docs/runbook/adapter-feishu-form-integration.md`
2. `README.md` 与 `.env.example` 更新
3. example curl / payload contract
4. targeted + full verification evidence writeback 到 status

done_when:

1. 操作方仅靠 repo 文档即可知道如何配置 app 权限、Base 权限、`appToken/tableId/formId`
2. 文档明确区分“写 backing table record”与“完整智能表单控制”边界
3. `npm run verify` 或明确约束下的 honest regression 结果被记录

stop_boundary:

1. 不追加 release automation / CI hardening
2. 不在 closeout 前临时加第二条 form-related 产品主线

必须避免：

1. 文档宣称超出现实 API 能力的“智能表单完全控制”
2. 缺少真实 payload 示例与错误边界说明

## Exit Criteria

- `FW1.S1` ~ `FW1.S4` 都有 concrete `done_when` / `stop_boundary`
- POC v1 的 active/queued slices 都围绕单一主线：`POST /providers/form-webhook -> existing Base/table record write`
- review handoff 保持显式：执行后应交给 `execution-reality-audit`
- 若 pack 完成，closeout 使用 repo-local closeout prompt surface；若 form-control surfaces 仍需推进，必须创建 successor pack 而不是在本 pack 内隐式扩 scope
