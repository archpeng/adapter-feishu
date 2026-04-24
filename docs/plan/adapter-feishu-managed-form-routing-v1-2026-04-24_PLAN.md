# adapter-feishu managed form routing v1 plan

- plan_id: `adapter-feishu-managed-form-routing-v1-2026-04-24`
- plan_class: `execution-plan`
- status: `active`
- mode: `autopilot-control-plane`
- predecessor_plan: `adapter-feishu-form-webhook-poc-v1-2026-04-23`
- last_updated: `2026-04-24`

## Goal

在 `adapter-feishu` 中落一个**Route A 最小可用版**：

```text
POST /providers/form-webhook
  + formKey
  -> server-side registry binding
  -> business field name -> Feishu field name mapping
  -> optional fixed field injection
  -> optional schema preflight
  -> existing Feishu Base(Bitable) record create
```

本 pack 的产品落点固定为：

- 让调用方只需要传 `formKey + fields`，而不是显式传 `appToken/tableId/formId`
- 在 adapter 服务端受控维护多表单绑定、字段映射、默认校验策略与固定字段
- 复用已经落地并经过真实验证的 `/providers/form-webhook`、schema preflight、dedupe 与同表串行写路径
- 保持 repo 边界诚实：这是**existing Feishu form/table 的受控接入层**，不是完整表单控制面

## Scope

- `src/config.ts`：新增 managed form registry path/config contract
- `src/forms/registry.ts`（new）：registry types、load/parse/validation seam
- `src/server/formWebhook.ts`：managed `formKey` routing、fieldMap、fixedFields、稳定错误面
- `src/runtime.ts`：startup registry wiring
- `.env.example`
- `config/form-bindings.example.json`（new）
- `test/config.test.ts`
- `test/server/formWebhook.test.ts`
- `test/runtime.test.ts`
- `test/docs-boundary.test.ts`（若 boundary prose 需要收紧）
- `docs/runbook/adapter-feishu-form-integration.md`
- `README.md`

## Non-Goals

- 不在本 pack 内实现 Feishu Base / table / form 的 create / patch / publish workflow
- 不实现动态 admin UI、数据库化 control plane 或热更新 registry
- 不实现复杂 value transform DSL、JSONPath engine、option id lookup、附件上传或 field auto-create
- 不让 managed 调用方继续直接携带 raw Feishu target 作为主接入模式
- 不把 repo 描述成 multi-tenant full smart-form platform
- 不引入 repo 外第二套 plan/control-plane mirror；`docs/plan/*` 继续保持单一机器真相

## Deliverables

1. **Managed form registry contract**
   - `ADAPTER_FEISHU_FORM_REGISTRY_PATH`
   - startup file load / parse / fail-fast validation
   - stable binding shape: `formKey -> target + fieldMap + fixedFields + policy`
2. **Managed formKey ingress path**
   - `POST /providers/form-webhook` 支持 `formKey`
   - legacy default-target path 保持兼容
   - managed mode 稳定错误面与 target shielding
3. **Field mapping and bounded policy layer**
   - business field key -> Feishu canonical field name
   - optional fixed field injection
   - reject unmanaged / unmapped field drift by policy
4. **Operator-facing handoff package**
   - example registry
   - updated runbook / README / env contract
   - regression proof and, if external conditions permit, one live managed binding proof

## Constraints

- 保持当前消息/卡片 delivery path 不回归：`/providers/webhook`、`/providers/card-action`、`/webhook` 必须保持原有边界
- managed mode 必须建立在当前已验证的 existing Base/table/form write path 之上，不能旁路现有 dedupe / serialization / schema preflight 逻辑
- legacy mode 仍需可用：没有 `formKey` 的请求继续沿用当前 default-target / override policy
- managed mode 默认不向调用方暴露 raw `target`；若请求同时提供 `formKey` 与 `target`，必须走稳定拒绝面而不是隐式二选一
- v1 只做**字段名映射**与**固定字段注入**；字段值类型仍由调用方按真实 Feishu schema 负责
- registry 配置必须在启动时可验证；无效配置应 fail fast，而不是把不确定性推到运行时
- 继续保持 repo 边界诚实：existing form/table integration，而非 full smart-form control plane
- 如果本 pack 运行在 extension autopilot 语义下，每个 phase 结束时必须只有一个 `autopilot_report`；active-slice phase 的 `stepId` 必须等于 active slice ID

## Verification

1. `test/config.test.ts`
2. `test/server/formWebhook.test.ts`
3. `test/runtime.test.ts`
4. `test/docs-boundary.test.ts`（如 boundary 文案更新）
5. targeted `npm test -- test/config.test.ts test/server/formWebhook.test.ts test/runtime.test.ts`
6. full `npm run verify`
7. 若外部权限与真实表单资源可用：对至少一个 managed `formKey` 做 live `POST /providers/form-webhook` proof

## Master Wave Plan

### Wave 1 / 5 — registry contract freeze

目标：

- 冻结 managed form registry 的配置、文件结构、startup validation 与 example surface，让后续 routing slice 不再反复讨论 binding shape

主交付：

1. `ADAPTER_FEISHU_FORM_REGISTRY_PATH` env contract
2. `src/forms/registry.ts` load/parse/validation seam
3. `config/form-bindings.example.json`
4. `test/config.test.ts` 与必要 `test/runtime.test.ts` proof

验证路径：

- `npm test -- test/config.test.ts test/runtime.test.ts`

完成后交接：

- `execute-plan` 进入 `MFR1.S2`

### Wave 2 / 5 — managed formKey routing + mapping

目标：

- 交付 `formKey` 受控路由、business field -> Feishu field 映射与 fixedFields 注入，不回归 legacy form-webhook surface

主交付：

1. `src/server/formWebhook.ts` managed mode path
2. runtime wiring for loaded registry
3. stable managed-mode errors and compatibility tests

验证路径：

- `npm test -- test/server/formWebhook.test.ts test/runtime.test.ts`

完成后交接：

- `execute-plan` 进入 `MFR1.S3`

### Wave 3 / 5 — docs, example bindings, regression baseline

目标：

- 让 operator 能 honest onboard managed forms：配置、请求契约、registry 示例、边界与回归入口全部明确

主交付：

1. `README.md`
2. `docs/runbook/adapter-feishu-form-integration.md`
3. `.env.example`
4. `config/form-bindings.example.json` cross-check 与必要 docs-boundary proof

验证路径：

- docs/code cross-read
- `npm run verify`

完成后交接：

- `execute-plan` 进入 `MFR1.S4`

### Wave 4 / 5 — live managed proof and residual capture

目标：

- 用当前 repo 代码对至少一个真实 managed `formKey` 绑定做 live proof，或在外部权限不足时留下证据化 residual，而不是只停留在本地单测层面

主交付：

1. one real managed binding config for local proof path
2. live request / response evidence or blocker evidence
3. residual notes for any external constraint discovered

验证路径：

- current-code local run + live `POST /providers/form-webhook`
- reuse `npm run verify` truth from Wave 3 unless code changed after proof attempt

完成后交接：

- `execution-reality-audit`

### Wave 5 / 5 — reality audit and closeout routing

目标：

- 审核 managed routing 是否真的满足最小多表单定制接入目标，并决定 closeout 还是 successor pack

主交付：

1. review evidence against plan claims
2. closeout-ready status writeback or successor-pack decision

验证路径：

- `execution-reality-audit` evidence + current repo/test/runtime truth

完成后交接：

- repo-local closeout prompt surface，或必要时回 `plan-creator`

## Best First Wave To Execute Now

- `MFR1.S1` — registry contract + startup parsing freeze

## Blockers / Risks

1. 若 registry contract 试图承载值转换 DSL、动态 schema patch 或 live admin editing，scope 会膨胀成 control-plane 项目
2. 若 managed mode 与 legacy mode 的优先级不清晰，容易把 `/providers/form-webhook` 变成隐式多语义入口
3. Feishu 权限、form visibility 与 table field drift 仍是 live proof 的第一外部 blocker 类
4. 若 fieldMap 允许半映射或静默透传，容易让业务字段 drift 在运行时才爆炸，破坏“定制接入”的受控价值
5. 若 example registry 与 runbook 不同步，operator 可能重新退回 raw target override，而不是使用 `formKey`
6. 当前 repo 已有诚实边界测试；若文案 drift 成“完整表单控制面”，必须在 docs-boundary 层被及时拦住

## Slice Definitions

#### `MFR1.S1` — registry contract + startup parsing freeze

- Owner: `execute-plan`
- State: `READY`
- Priority: `highest`

目标：

- 落地 managed form registry 的配置与 startup validation seam，冻结 `formKey -> target + fieldMap + fixedFields + policy` 的最小稳定 contract

交付物：

1. `ADAPTER_FEISHU_FORM_REGISTRY_PATH` env contract 与 parse rule
2. `src/forms/registry.ts`（new）提供 load/parse/validation seam
3. `config/form-bindings.example.json` 作为 operator baseline
4. `test/config.test.ts` / `test/runtime.test.ts` 锁定 startup 行为与 fail-fast surface

likely_files:

1. `src/config.ts`
2. `src/forms/registry.ts`
3. `.env.example`
4. `config/form-bindings.example.json`
5. `test/config.test.ts`
6. `test/runtime.test.ts`

execution_steps:

1. 在 `src/config.ts` 中增加 registry path contract，并决定“未配置 registry 时维持 legacy-only；配置后启动必须能 load 成功”的规则
2. 在 `src/forms/registry.ts` 中定义 binding shape、顶层 schema 与 parse/validation error surface
3. 写一个最小 example registry，覆盖 `enabled`、`target`、`fieldMap`、`fixedFields`、`validateFormSchemaByDefault` 等核心字段
4. 用 config/runtime tests 锁定 valid/invalid registry 的启动行为，避免后续 routing slice 再反复讨论 contract

validation_shape:

1. config test 断言 registry path 为空时仍允许 legacy-only startup
2. config/runtime test 断言 registry path 配置后，missing file / invalid JSON / invalid binding 会 fail fast
3. valid registry test 断言 example binding shape 被稳定读入，而不是把 raw JSON 到处下沉
4. targeted validation 使用 `npm test -- test/config.test.ts test/runtime.test.ts`

wave_exit_criteria:

1. registry file contract、binding shape 与 startup validation 已落地且有测试锁定
2. `MFR1.S2` 能直接消费 loaded registry，而无需重新讨论 `formKey` 或 `fieldMap` 的最小 shape
3. 本 slice 结束时还没有把 request-routing、field transformation 与 docs writeback 混成一锅

done_when:

1. startup 已能稳定区分 legacy-only mode 与 managed-registry mode
2. 至少一个 example binding 能被成功 load，并且 invalid registry 会明确 fail fast
3. 当前 slice 完成后，`MFR1.S2` 只需关注 request path，而不再讨论 registry 基本 contract

stop_boundary:

1. 本 slice 不实现 `formWebhook` request path 改造，不把 managed routing 逻辑提前揉进 config/parser 提交块
2. 本 slice 不引入数据库、热更新或 live admin editing；这些若变成必须项，应回 `plan-creator` replan

必须避免：

1. 用 env-per-form 拼出难以维护的伪 registry
2. 让 example registry 先天依赖本地私有资源才可读，导致 contract 无法被测试稳定消费

#### `MFR1.S2` — managed formKey routing + mapping write path

- Owner: `execute-plan`
- State: `queued`
- Priority: `high`

目标：

- 在不破坏 legacy mode 的前提下，交付 `formKey` 路由、fieldMap 转换、fixedFields 注入与 managed-mode 稳定错误面

交付物：

1. `formKey` request contract
2. registry binding resolve + `target` shielding
3. business field -> Feishu field name mapping
4. fixedFields merge 与 stable invalid-payload errors

likely_files:

1. `src/server/formWebhook.ts`
2. `src/runtime.ts`
3. `test/server/formWebhook.test.ts`
4. `test/runtime.test.ts`

execution_steps:

1. 在 request parse 阶段识别 managed mode：`formKey` present -> registry resolve；no `formKey` -> legacy path
2. 设计 `formKey + target` 冲突、unknown/disabled formKey、unmapped field 等稳定错误面
3. 在 createRecord 前完成 fieldMap 与 fixedFields merge，并继续复用现有 schema validation / dedupe / tableWriteQueue 路径
4. 用 tests 锁定 managed/legacy 双路径与错误面，防止 regression 把单一入口变成隐式魔法

validation_shape:

1. managed mode happy path 断言请求只传 `formKey + fields` 也能正确落到 resolved target
2. tests 断言 unmapped field、unknown formKey、disabled formKey、`formKey + target` 冲突都有稳定错误
3. tests 断言 legacy mode 仍支持 default target / override policy，不被 managed path 破坏
4. targeted validation 使用 `npm test -- test/server/formWebhook.test.ts test/runtime.test.ts`

wave_exit_criteria:

1. managed 与 legacy 两条路径都已被测试锁定
2. 业务字段已在 adapter 内映射到 Feishu canonical field name，fixedFields 注入可用
3. 当前 slice 完成后，operator 已无需向 managed caller 暴露 raw Feishu target

done_when:

1. `POST /providers/form-webhook` 已支持 `formKey` managed mode 且不破坏 legacy mode
2. managed request 能复用现有 schema validation / record create path 完成真实 write preparation
3. 稳定错误面已覆盖 formKey resolve 与 fieldMap drift 的主要失败类

stop_boundary:

1. 本 slice 不引入复杂 value coercion、option lookup、attachment upload 或 field auto-create
2. 若 field value transform 被证明为必需才能继续，应停止并回 `plan-creator` 重新拆 pack，而不是在本 slice 内偷扩 scope

必须避免：

1. 静默透传 unmapped 字段，让 registry 失去受控价值
2. 把 managed mode 写成另一个完全独立 endpoint，造成双路面长期分叉

#### `MFR1.S3` — docs, example bindings, and regression baseline

- Owner: `execute-plan`
- State: `queued`
- Priority: `high`

目标：

- 让 managed routing 能被 honest handoff：operator 看到的配置、请求示例、边界声明与回归入口都与代码一致

交付物：

1. `README.md` 中的 managed-routing quick start / boundary writeback
2. `docs/runbook/adapter-feishu-form-integration.md` 的 managed mode contract、registry example 与 troubleshooting
3. `.env.example` 更新
4. 必要的 boundary or docs regression test writeback

likely_files:

1. `README.md`
2. `docs/runbook/adapter-feishu-form-integration.md`
3. `.env.example`
4. `config/form-bindings.example.json`
5. `test/docs-boundary.test.ts`

execution_steps:

1. 更新 quick-start，让调用方优先看到 `formKey + fields` 的 managed path，而不是 raw target override
2. 在 runbook 里明确 managed mode 与 legacy mode 的关系、registry contract、错误面与边界
3. cross-read docs/code/example registry，避免 operator 文档先 drift 到 full form control plane 叙事
4. 跑 full regression，确保 docs and code truth 一致

validation_shape:

1. README 与 runbook 都能从零解释 registry + `formKey` 模式，不依赖隐藏聊天上下文
2. docs-boundary proof 若存在，应继续约束 repo 不夸大为 full smart-form control plane
3. full validation 使用 `npm run verify`

wave_exit_criteria:

1. operator-facing docs、example registry 与 env contract 已全部对齐当前代码 truth
2. full regression 通过
3. `MFR1.S4` 只剩 live managed proof 与 residual capture，而不是回头补文档债

done_when:

1. managed routing 的 operator handoff 文档已完整、可执行且边界诚实
2. `.env.example` 与 example registry 足以支持后续本地或容器启动
3. `npm run verify` 通过，且没有 docs/code truth drift

stop_boundary:

1. 本 slice 不新增产品能力；若文档暴露了缺 capability，记为 residual 或回前一 slice，而不是在 docs slice 偷写实现
2. 不把 example registry 写成依赖私有 tenant secrets 的 tracked production config

必须避免：

1. 文档继续把 raw target override 写成首选接入方式
2. 文案漂移成“完整表单设计/控制平台”

#### `MFR1.S4` — live managed proof + closeout-ready writeback

- Owner: `execute-plan`
- State: `queued`
- Priority: `medium`

目标：

- 用至少一个真实 managed `formKey` 绑定证明当前代码不只是单测通过，而是能在真实 Feishu 资源上完成受控接入

交付物：

1. one local managed binding for a real form target
2. one live managed request proof or explicit blocker evidence
3. status/workset writeback for any residuals discovered before review

likely_files:

1. local untracked registry/env config for proof
2. `docs/plan/adapter-feishu-managed-form-routing-v1-2026-04-24_STATUS.md`
3. `docs/plan/adapter-feishu-managed-form-routing-v1-2026-04-24_WORKSET.md`（如需 writeback）

execution_steps:

1. 用当前已验证的 Feishu target 准备一个本地 managed binding，优先复用现有 `pms` form 资源
2. 启动 current-code runtime，发送只含 `formKey + fields` 的 managed request，并保留 request/response evidence
3. 若 live proof 被权限、schema 漂移或环境限制阻塞，记录 blocker evidence 与 honest residual，而不是臆造“应该可行”
4. 若本 slice 改动代码或文档，再次执行必要 regression；若无代码变更，复用 `MFR1.S3` 的 verify truth

validation_shape:

1. live request 成功时，返回 `200 record_created`，并证明调用方未显式提供 raw `target`
2. 若失败，必须留下 upstream error、config truth 与 stop reason 证据
3. 如有代码变更，再跑 `npm run verify`

wave_exit_criteria:

1. 至少一个 managed binding 已有 live truth，或 blocker evidence 已足够支撑 review 不再猜测
2. review 所需 residual 已写回 status/workset，而不是散落在会话中
3. 下一步可确定交给 `execution-reality-audit`

done_when:

1. live managed proof 已成功，或 external blocker 已被证据化并写回 pack
2. 当前 pack 的执行面已足以进入 reality audit，而不是继续发散新能力

stop_boundary:

1. 本 slice 不因 live proof 受阻就转向新增 value transform、field patch 或 schema control 能力
2. 若 live 资源权限或 tenancy 条件变化导致 scope 需要改写，应停止并回 `plan-creator` 而不是临场改 pack 目标

必须避免：

1. 用 legacy target-based 请求冒充 managed proof
2. 把一个 tenant-specific blocker包装成通用代码缺陷而贸然扩 scope

## Exit Criteria

- `docs/plan/README.md`、`PLAN`、`STATUS`、`WORKSET` 对 active slice / intended handoff 保持一致
- active 与 queued slices 都携带 concrete `done_when` / `stop_boundary`
- managed mode 支持 `formKey + fields`，并保持 legacy path honest 兼容
- registry / docs / tests / live proof（或 blocker evidence）足以支撑 `execution-reality-audit`
- 若 workstream 达到 terminal completion，closeout 走 repo-local closeout prompt surface，而不是 invent 新 mirror
