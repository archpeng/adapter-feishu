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

## Master Wave Plan

### Wave 1 / 5 — contract seam freeze

目标：

- 冻结 `FW1.S1` 所需的 Bitable client seam、form webhook config、auth 边界与 export surface

主交付：

1. `src/channels/feishu/bitableClient.ts`
2. `src/config.ts` / `.env.example` 的 `ADAPTER_FEISHU_FORM_*` contract
3. `test/channels/feishu/bitableClient.test.ts` 与必要 `test/config.test.ts`

验证路径：

- `npm test -- test/channels/feishu/bitableClient.test.ts test/config.test.ts`

完成后交接：

- `execute-plan` 进入 `FW1.S2`

### Wave 2 / 5 — ingress write path

目标：

- 交付 `POST /providers/form-webhook` 的最小稳定写链路，不回归现有消息/卡片 surfaces

主交付：

1. `src/server/formWebhook.ts`
2. `src/server/httpHost.ts` / `src/runtime.ts` route wiring
3. `test/server/formWebhook.test.ts`、`test/server/httpHost.test.ts`、`test/runtime.test.ts`

验证路径：

- `npm test -- test/server/formWebhook.test.ts test/server/httpHost.test.ts test/runtime.test.ts`

完成后交接：

- `execute-plan` 进入 `FW1.S3`

### Wave 3 / 5 — schema preflight and table-write safety

目标：

- 在不扩 scope 的前提下补足 form-backed write 的最低安全面：可选 preflight 与同表串行写保护

主交付：

1. `validateFormSchema` optional path
2. `src/state/tableWriteQueue.ts`（若验证后确有必要）
3. queue / preflight 覆盖测试

验证路径：

- `npm test -- test/server/formWebhook.test.ts test/state/tableWriteQueue.test.ts`（如 queue 引入）

完成后交接：

- `execute-plan` 进入 `FW1.S4`

### Wave 4 / 5 — docs and regression baseline

目标：

- 让 POC v1 可被 honest handoff：配置、权限、调用方式、边界、示例与回归入口都明确

主交付：

1. `docs/runbook/adapter-feishu-form-integration.md`
2. `README.md` / `.env.example` 更新
3. curl/example payload + verification writeback

验证路径：

- `src/config.ts` / `src/server/formWebhook.ts` / `src/runtime.ts` 与新文档面的 cross-read
- `npm run verify`

完成后交接：

- `execution-reality-audit`

### Wave 5 / 5 — reality audit and closeout routing

目标：

- 审核实现是否真正满足 POC v1 边界，并决定 closeout 还是 successor pack

主交付：

1. reality audit evidence
2. closeout-ready status writeback or successor-pack decision

验证路径：

- `execution-reality-audit` evidence + full regression truth

完成后交接：

- repo-local closeout prompt surface，或必要时回 `plan-creator`

## Best First Wave To Execute Now

- `wave-5/5` 是当前最优继续波次，因为 `FW1.S4` 已完成 operator-facing docs、payload example 与 `npm run verify` 基线写回；下一步应做 `execution-reality-audit` 审核与 closeout/successor routing，而不是重新打开实现面

## Blockers / Risks

1. Feishu 应用权限与 Base 文档应用权限若未提前配置，POC 代码即使正确也会返回 `permission denied`
2. 字段名与实际 Base schema 不一致时，record create 会触发 `FieldNameNotFound` 或字段类型错误
3. 若 `form_id` 不可用，则 schema preflight 只能退化为 table-level record write；不得谎称完整 form semantic parity
4. 当前 workspace 因 active slice 代码与 `docs/plan/*` 写回而处于 dirty 状态；继续执行时应保持切片内改动有界，避免把 closeout 或 successor-pack 工作提前混入 `FW1.S4`
5. 若 SDK 类型面与 repo 的 ESM/TypeScript 约束冲突，优先保持本地 wrapper seam 简单而非把 runtime 直接绑死在 SDK 细节上
6. 同一 `table` 的写冲突是上游真实约束；`FW1.S3` 仅补足 bounded in-process serialization，跨进程/跨实例一致性仍不在本 POC v1 scope 内

## Slice Definitions

#### `FW1.S1` — bitable client + config/auth contract freeze

- Owner: `execute-plan`
- State: `DONE`
- Priority: `highest`

目标：

- 落地 Feishu Base/Bitable client seam 与配置边界，确保后续 server slice 不直接把 SDK 细节撒进 runtime

交付物：

1. `src/channels/feishu/bitableClient.ts`，封装 `createRecord / getForm / listFormFields`
2. `src/config.ts` 与 `.env.example` 中的 form webhook / default target / override policy 配置
3. `test/channels/feishu/bitableClient.test.ts` 与必要的 `test/config.test.ts` 覆盖

likely_files:

1. `src/channels/feishu/bitableClient.ts`
2. `src/config.ts`
3. `.env.example`
4. `src/index.ts`（仅在 export wiring 必要时）
5. `test/channels/feishu/bitableClient.test.ts`
6. `test/config.test.ts`

execution_steps:

1. 在 `src/channels/feishu/bitableClient.ts` 先定义本地 request/response seam，封装 SDK client construction 与 `createRecord / getForm / listFormFields`
2. 在 `src/config.ts` / `.env.example` 明确 `ADAPTER_FEISHU_FORM_*` contract，冻结 default target、auth 分离与 override gate
3. 仅做必要 export wiring，让后续 slice 能直接 import seam，但不触碰 `src/server/*` 或 `src/runtime.ts` 的行为
4. 在 `test/channels/feishu/bitableClient.test.ts` / `test/config.test.ts` 中锁定参数映射、auth 分离与 env parsing 行为

validation_shape:

1. `createRecord` test 断言 `app_token`、`table_id`、`client_token`、`user_id_type` 与 `fields` 传递正确
2. `getForm / listFormFields` test 断言 `form_id` / path mapping 正确，且 wrapper 返回稳定的本地 seam shape 而不是 raw SDK 响应
3. config test 断言 form webhook auth token 与 provider webhook auth token 分离，`ADAPTER_FEISHU_FORM_*` default target / override gate 行为清晰
4. targeted validation 使用 `npm test -- test/channels/feishu/bitableClient.test.ts test/config.test.ts`

wave_exit_criteria:

1. `src/channels/feishu/bitableClient.ts`、`.env.example`、相关测试文件已落地并可通过 targeted validation
2. `FW1.S2` 可直接消费 client seam 与 config contract，而无需重新讨论 SDK payload shape 或 target override 规则
3. 本 wave 结束时未把 HTTP ingress / runtime wiring 提前混入 `FW1.S1`

done_when:

1. wrapper seam 已覆盖 `createRecord / getForm / listFormFields`
2. config 已明确 `ADAPTER_FEISHU_FORM_*` contract 与 override gate
3. 当前 slice 完成后，`FW1.S2` 可直接消费该 seam 而无需重新讨论 client contract

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
- State: `DONE`
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
- State: `DONE`
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
- State: `DONE`
- Priority: `medium`

目标：

- 让 POC v1 可以被 honest handoff：如何配置、如何调用、知道哪些能力已支持/未支持

交付物：

1. `docs/runbook/adapter-feishu-form-integration.md`
2. `README.md` 与 `.env.example` 更新
3. example curl / payload contract
4. targeted + full verification evidence writeback 到 status

likely_files:

1. `docs/runbook/adapter-feishu-form-integration.md`
2. `README.md`
3. `.env.example`
4. `docs/plan/README.md`
5. `docs/plan/adapter-feishu-form-webhook-poc-v1-2026-04-23_PLAN.md`
6. `docs/plan/adapter-feishu-form-webhook-poc-v1-2026-04-23_STATUS.md`
7. `docs/plan/adapter-feishu-form-webhook-poc-v1-2026-04-23_WORKSET.md`

execution_steps:

1. 先以 `src/config.ts`、`src/server/formWebhook.ts`、`src/runtime.ts` 为 source-of-truth，抽出 form webhook 的 auth、default target、override gate、`validateFormSchema`、stable responses 与 same-table serialization boundary
2. 新增 `docs/runbook/adapter-feishu-form-integration.md`，明确 Feishu app 权限、Base / table / form 前置条件、默认 target / override 行为、`formId` 缺失时的 honest degrade、以及 request/response 示例
3. 更新 `README.md` 与 `.env.example`，让 landing 文档和 env contract 都指向 `POST /providers/form-webhook` 的真实能力与边界，而不是把 repo 描述成完整“智能表单控制面”
4. 运行 `npm run verify`；若被与本 slice 无关的既有问题阻塞，则记录 exact command、失败表面与为何不阻断本 slice 结论，并把 honest regression truth 写回 `STATUS` / `WORKSET`
5. 在同一 turn 写回 `docs/plan/README.md` / `PLAN` / `STATUS` / `WORKSET`，把下一 handoff 收敛到 wave-5 的 `execution-reality-audit`

validation_shape:

1. 文档必须逐项覆盖 `ADAPTER_FEISHU_FORM_*` env、Feishu app 凭据、Base 权限、`appToken/tableId/formId`、auth token、`validateFormSchema` 与 override gate
2. example curl / payload 必须与 `src/server/formWebhook.ts` 当前 contract 对齐，至少覆盖 default-target happy path、`validateFormSchema` 可选字段、稳定错误边界与 `record_created` / `duplicate_ignored` 响应
3. 验证优先使用 `npm run verify`；若受 repo 既有问题阻塞，必须在 status/writeback 中写明 exact command、失败表面与为何不阻断当前 slice 结论

wave_exit_criteria:

1. operator-facing 文档已足以独立配置并调用 form webhook POC v1，而无需再回读会话上下文
2. 文档与 `.env.example` 对 form-backed table write 的边界描述与当前代码一致，未夸大为完整智能表单控制
3. verification truth 已写回控制面，并把下一 handoff 明确收敛到 wave-5 review

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
