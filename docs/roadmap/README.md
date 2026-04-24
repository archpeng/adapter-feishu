# adapter-feishu 智能 PMS 路线图

> 状态：roadmap source-of-truth draft，基于当前 `main` 分支代码事实与 `docs/prd/*` 产品方案整理。
> 目标：在不破坏 `adapter-feishu` 现有架构边界的前提下，把“飞书多维表格 + 表单视图 + 自动化 + Bot 通知 + Codex/MCP 外层入口”的酒店轻 PMS 路径拆成可执行阶段。
> 非目标：这里不是 active `docs/plan/*` workset；需要开始实现某个阶段时，再为该阶段单独创建 plan/status/workset。

## 1. 当前代码事实

| 维度 | 当前事实 | 证据文件 |
|---|---|---|
| 产品定位 | `adapter-feishu` 是 standalone Feishu/Lark channel service | `README.md`, `docs/architecture/adapter-feishu-architecture.md` |
| 主干架构 | `Feishu ingress / alert ingress -> provider-neutral adapter core -> provider router -> backend-specific provider -> Feishu card / message delivery` | `docs/architecture/adapter-feishu-architecture.md` |
| 已有 provider | `warning-agent` notify-first provider | `src/providers/warning-agent/**` |
| 已有表单入口 | `POST /providers/form-webhook` | `src/server/formWebhook.ts`, `src/server/httpHost.ts` |
| 表单写入能力 | 写入现有 Feishu Base/Bitable table record | `src/channels/feishu/bitableClient.ts` |
| managed mode | 通过 `formKey` 从本地 registry 解析 target、`fieldMap`、`fixedFields`、policy | `src/forms/registry.ts`, `config/form-bindings.example.json` |
| schema preflight | 可用现有 `formId` 校验 form/table fields | `src/server/formWebhook.ts`, `src/channels/feishu/bitableClient.ts` |
| 幂等与写入安全 | `clientToken` UUIDv4 + dedupe；同表 in-process serialization | `src/state/dedupe.ts`, `src/state/tableWriteQueue.ts` |
| 配置边界 | env-based standalone runtime config | `src/config.ts`, `.env.example` |
| 验证基线 | `npm run verify` | `package.json`, `test/**` |
| plan 状态 | Wave 1-3 execution pack `adapter-feishu-pms-smart-intake-v1-2026-04-24` 已完成并归档；当前无 active pack | `docs/plan/README.md`, `docs/archive/plan/adapter-feishu-pms-smart-intake-v1-2026-04-24_CLOSEOUT.md` |

## 2. 架构规范：后续路线必须遵守

这些是路线图的硬约束，不随单个 PMS 需求变化。

1. **Adapter core 不变成 PMS core。**
   `src/core/**`, `src/server/httpHost.ts`, `src/runtime.ts` 只能承载 channel service、routing、composition、bounded adapter state，不承载酒店业务状态机真相。

2. **飞书表单路径只写已有 Base/table/form。**
   继续保持：不创建 Base/table/form，不 patch 表单，不自动建字段，不做附件上传 pipeline，不承诺 cross-instance write coordination。

3. **`/providers/form-webhook` 继续是受控 record-write ingress。**
   它负责 auth、payload validation、`formKey` routing、字段映射、固定字段注入、schema preflight、dedupe、record create；不要把退房、入住、换房等业务状态机直接堆进 `formWebhook.ts`。

4. **PMS 业务逻辑若进入本仓库，必须进入明确边界模块。**
   可选落点：`src/providers/pms/**` 或 `src/forms/pms/**`。禁止把 PMS 字段、房态码、订单语义泄漏进 provider-neutral contracts。

5. **Codex/MCP 是外层接入，不是本仓库的新核心身份。**
   推荐路径：`Codex/MCP wrapper -> HTTP POST /providers/form-webhook -> Feishu Base`。除非另有 plan 明确改边界，否则本仓库不升级为通用 MCP server / agent runtime。

6. **所有目标 ID 和租户信息必须服务端管理。**
   PMS form target 必须通过 registry 或部署配置提供；不能要求调用方传 raw `target` 作为常规路径；不能提交真实 tenant appToken/tableId/formId/secrets。

7. **PMS 产品承诺保持轻量。**
   当前目标是“飞书智能表格版轻 PMS / 房态运营系统”，不是完整商业 PMS。支付、公安旅业、门锁、OTA 渠道、发票、会员、夜审财务默认不进入本路线图。

## 3. 产品目标边界

### 3.1 本路线图要达成的产品形态

```text
Codex / Bot / Frontdesk system / Feishu form
  -> controlled PMS operation request
  -> adapter-feishu managed form route
  -> Feishu Base/Bitable record write
  -> Feishu automation / views / approval / Bot notifications
  -> room ledger, housekeeping tasks, maintenance tickets, operation logs
```

第一阶段的核心不是让 adapter 直接执行所有 PMS 状态变更，而是建立一个可靠的 **智能 PMS 操作请求入口**：

```text
pms operation request table = PMS 智能表单底表 / command intake table
```

### 3.2 适合覆盖的业务

| 业务域 | 路线图内目标 |
|---|---|
| 房态查看 | 通过飞书 Base 视图/仪表盘实现前台房态墙、今日预抵/预离、可售房、脏房、OOO |
| 退房 | 写入 `CHECK_OUT` 请求；由飞书自动化/后续状态机触发房间转空脏和保洁任务 |
| 保洁 | 写入/流转保洁任务：待派单、清扫中、待查、返工、完成 |
| 工程 | 写入维修工单；停卖类工单影响可售状态/OOO |
| 操作留痕 | 所有入口写 `clientToken`、source、operator、reason、payload/result JSON |
| 经理看板 | 依赖 Base views/dashboard，不由 adapter 内置 BI |

### 3.3 默认不覆盖

| 非目标 | 原因 |
|---|---|
| 完整商业 PMS 替代 | 当前仓库是 Feishu adapter，不是酒店核心交易系统 |
| 支付/押金/发票 | 财务与权限风险高，需独立系统设计 |
| 公安旅业上传 | 合规系统，不应混入 channel adapter |
| 门锁/OTA/会员/夜审 | 需要独立 connector、数据一致性与补偿机制 |
| 浏览器表单自动化 | 不稳定且违背“写底表”技术路线 |

## 4. 目标版本切分

| 版本 | 名称 | 核心交付 | 是否需要大重构 |
|---|---|---|---|
| `v0.1` | PMS smart intake | 多 PMS `formKey` 通过现有 `/providers/form-webhook` 写入“智能 PMS 操作请求表” | 否 |
| `v0.2` | Frontdesk workbench | 前台房态墙、预抵/预离、退房/保洁/工程表单和 Base 视图规范 | 否，偏配置/文档 |
| `v0.3` | Controlled workflow hooks | 可选最小 Bitable read/update/search，支持若干受控状态机动作 | 小步扩展 Bitable seam |
| `v0.4` | Notification and approval loop | Bot 通知、审批/确认、异常提示，复用现有 Feishu client/reply sink | 局部扩展 |
| `v0.5` | External Codex/MCP wrapper | 外部 MCP tools 调用 adapter HTTP contract | 不改 adapter core |
| `v1.0` | Operational pilot | 单店/小规模酒店可运行试点：权限、配置、回归、runbook、smoke evidence 完整 | 不应重构，只做加固 |

## 5. Roadmap waves

### Wave 0 — 冻结路线与证明语言

| 项 | 内容 |
|---|---|
| 目标 | 把当前架构边界、PMS 产品边界、分阶段路线写成稳定 roadmap，避免后续把本仓库误改成 PMS monolith 或 MCP runtime。 |
| 主要产物 | `docs/roadmap/README.md`。 |
| 允许改动 | 仅文档。 |
| 不允许改动 | 不改 `src/**`，不创建 active `docs/plan/*`，不引入新 runtime。 |
| 达成标准 | 文档明确 current truth、non-goals、waves、每步 done_when、验证路径。 |
| 验证 | `npm run verify` 仍通过；repo 文档没有和 README/architecture boundary 冲突。 |

### Wave 1 — PMS intake over existing managed form route

| 项 | 内容 |
|---|---|
| 目标 | 用现有 `/providers/form-webhook` 和 managed registry 支撑 PMS 操作请求写入，不新增业务状态机。 |
| 代码触点 | `config/*.example.json`, `docs/runbook/**`, 可选 `test/docs-boundary.test.ts`。 |
| 建议 formKey | `pms-intake`, `pms-checkout`, `pms-housekeeping-done`, `pms-inspection-result`, `pms-maintenance-report`, `pms-maintenance-close`, `pms-change-room`, `pms-extend-stay`。 |
| 核心 contract | 调用方只发送 `formKey + clientToken + fields`；target/fieldMap/fixedFields 由服务端 registry 管理。 |
| 达成标准 | 每个 PMS formKey 都能映射到同一“智能 PMS 操作请求表”或对应业务表；固定字段注入 `Source`, `Ingress`, `Action`, `SchemaVersion`；禁止 raw target。 |
| 验证 | 单测覆盖至少 3 个 PMS formKey：正常映射、unmapped field、fixed field conflict、target override rejection。 |
| 非目标 | 不读取房间台账，不执行退房状态机，不自动创建保洁任务。 |

### Wave 2 — Feishu Base schema and view contract

| 项 | 内容 |
|---|---|
| 目标 | 把 PRD 中 PMS 数据模型落成 Base/table/form/view 的配置说明，使产品路径可由飞书低代码能力承接。 |
| 主要产物 | `docs/roadmap/pms-base-schema.md` 或 `docs/runbook/adapter-feishu-pms-base-setup.md`。 |
| 必备表 | 房间台账、智能 PMS 操作请求、保洁任务、工程维修、预订订单、操作日志、房型库存日历。 |
| 必备视图 | 前台房态墙、今日可售房、今日预抵、今日预离、在住房、空脏房、待查房、清扫中、工程停卖、异常房。 |
| 达成标准 | 每张表列出字段、类型建议、主键/唯一键、敏感字段规则、权限角色；每个 formKey 映射到明确表/字段。 |
| 验证 | 人工按文档创建一套 sandbox Base；用现有 `/providers/form-webhook` 写入至少一个 `pms-intake` record。 |
| 非目标 | adapter 不负责自动建表；文档不包含真实 appToken/tableId/formId。 |

### Wave 3 — Test-first PMS managed routing hardening

| 项 | 内容 |
|---|---|
| 目标 | 在写业务代码前，先用测试锁定 PMS managed routing 的安全边界。 |
| 代码触点 | `test/server/formWebhook.test.ts`, `test/runtime.test.ts`, `test/config.test.ts`, `test/docs-boundary.test.ts`。 |
| 测试点 | 多 formKey registry load；Action fixed field 注入；schema validation drift；disabled formKey；target shielding；dedupe with same table；placeholder-free deployment rule 文档断言。 |
| 达成标准 | PMS formKey 不需要改 `formWebhook.ts` 分支逻辑；所有差异通过 registry 表达。 |
| 验证 | `npm run verify` 通过；新增测试失败时能明确指出 contract 被破坏。 |
| 非目标 | 不添加 PMS 状态机，不扩展 Bitable update/search。 |

### Wave 4 — Minimal PMS operation request pilot

| 项 | 内容 |
|---|---|
| 目标 | 完成“自然语言/外部调用 -> adapter -> 飞书智能 PMS 操作请求表”的最小闭环。 |
| 输入 | HTTP 请求或外部 MCP wrapper 生成的 managed payload。 |
| 输出 | Feishu Base 中出现标准化 operation request record。 |
| 字段最小集 | `RequestId/clientToken`, `Source`, `Ingress`, `Action`, `Status`, `Operator`, `Reason`, `PayloadJSON`, `CreatedAt`, `SchemaVersion`。 |
| 达成标准 | `CHECK_OUT`, `REPORT_MAINTENANCE`, `HOUSEKEEPING_DONE` 三类请求能稳定落表；错误能返回 stable invalid_payload/schema_validation_failed/record_create_failed。 |
| 验证 | sandbox Feishu smoke：3 类请求成功；重复 `clientToken` 返回 duplicate；错误字段返回 schema/mapping error。 |
| 非目标 | 不保证房间台账自动变更；该 wave 只证明 intake。 |

### Wave 5 — Optional Bitable read/update seam for controlled workflows

| 项 | 内容 |
|---|---|
| 触发条件 | 只有当飞书自动化不足以完成业务闭环，才进入本 wave。 |
| 目标 | 在 `BitableClient` seam 上最小扩展 record query/update，为受控 PMS workflow 做准备。 |
| 代码触点 | `src/channels/feishu/bitableClient.ts`, tests under `test/channels/feishu/bitableClient.test.ts`。 |
| 建议新增能力 | `getRecord`, `list/searchRecords`, `updateRecord`, 可选 `batchCreateRecords`。 |
| 达成标准 | Bitable seam 可读房间台账、查 operation request 幂等键、更新单条 record；所有 SDK response 仍通过本地 adapter interface 归一化。 |
| 验证 | SDK adapter 单测覆盖 success/error/field normalization；不影响现有 createRecord/form schema tests。 |
| 非目标 | 不做跨表事务；不承诺强一致；不把所有 Base API 包成通用工具。 |

### Wave 6 — Controlled PMS workflow module

| 项 | 内容 |
|---|---|
| 触发条件 | Wave 5 已完成，且明确需要 adapter 执行部分状态机。 |
| 目标 | 把少数高价值 PMS 动作做成受控 workflow，而不是任意表写入。 |
| 推荐落点 | `src/providers/pms/**` 或 `src/forms/pms/**`，由 plan 决定；不得写入 provider-neutral core。 |
| 首批动作 | `CHECK_OUT`, `HOUSEKEEPING_DONE`, `INSPECTION_PASS`, `INSPECTION_FAIL`, `REPORT_MAINTENANCE`, `MAINTENANCE_CLOSE`。 |
| 状态规则 | 房态拆为占用状态、清洁状态、可售状态；工程完成不直接变 VC，必须经过清洁/查房。 |
| 安全规则 | 写操作必须有 `reason`、`clientToken/idempotencyKey`、operator；高风险动作需要 `confirm=true` 或 Feishu 审批字段。 |
| 达成标准 | 每个 workflow 有 dry-run/validation path、明确前置状态、写入结果、失败原因、操作日志。 |
| 验证 | 单元测试覆盖状态转移矩阵；sandbox E2E 覆盖退房 -> 空脏 -> 保洁任务 -> 待查/完成。 |
| 非目标 | 不实现入住/换房/延住全量复杂流程；不处理支付、门锁、OTA。 |

### Wave 7 — Notification, approval, and exception loop

| 项 | 内容 |
|---|---|
| 目标 | 复用现有 Feishu message/card delivery 能力，把 PMS 异常、审批、任务提醒接入飞书协作层。 |
| 代码触点 | `src/channels/feishu/client.ts`, `src/channels/feishu/replySink.ts`, `src/server/cardAction.ts`, 可选 PMS provider。 |
| 场景 | 工程停卖通知经理；退房后通知保洁；保洁超时提醒；查房返工通知；高风险操作审批。 |
| 达成标准 | 通知模板不污染 generic card template；callback/pending state 仍 provider-scoped；审批结果能回写 operation request status。 |
| 验证 | card rendering 单测；card-action dispatch 单测；sandbox Bot smoke。 |
| 非目标 | 不把飞书消息变成长期 workflow truth；truth 仍在 Base record。 |

### Wave 8 — External Codex/MCP wrapper

| 项 | 内容 |
|---|---|
| 目标 | 给 Codex/Agent 暴露 PMS tools，但通过 HTTP contract 调用 `adapter-feishu`，避免改变本仓库身份。 |
| 推荐形态 | 独立 wrapper repo/process；或本仓库外部 examples，不接入 runtime core。 |
| Tool 最小集 | `pms_write_smart_form`, `pms_get_room`（若 Wave 5 可读）, `pms_dashboard`（优先读 Base view/export 或独立查询）。 |
| 达成标准 | MCP tool 参数是业务 schema；wrapper 负责生成 UUIDv4 `clientToken`、调用 `/providers/form-webhook`、展示 adapter response。 |
| 验证 | 本地 stdio/http wrapper smoke；adapter contract tests 不因 wrapper 存在而变化。 |
| 非目标 | 不在 `adapter-feishu` 中引入通用 MCP SDK/runtime；不暴露任意写表工具。 |

### Wave 9 — Operational pilot hardening

| 项 | 内容 |
|---|---|
| 目标 | 单店/小规模酒店试点前的部署、权限、安全、回归、运行手册闭环。 |
| 重点 | registry secret management、auth token rotation、Feishu app 权限、Base 高级权限、schema drift handling、backup/export、manual recovery。 |
| 达成标准 | 有 sandbox/prod config split；真实 target ID 不进 git；部署失败能 fail fast；常见错误有 runbook；pilot 前 `npm run verify` 和 Feishu smoke 均通过。 |
| 验证 | `npm run verify`; local HTTP smoke; sandbox Feishu write smoke; duplicate and schema-drift negative smoke。 |
| 非目标 | 不解决多实例全局串行；如需要多实例写一致性，应另设 plan 引入外部 queue/lock。 |

## 6. PMS action matrix

| Action | 推荐 formKey | 第一落点 | v0.1 行为 | v0.3+ 可选行为 | 高风险等级 |
|---|---|---|---|---|---|
| `CHECK_OUT` | `pms-checkout` | 智能 PMS 操作请求表 | 写入请求，状态 `pending` | 房间转空脏，创建保洁任务，写日志 | 中 |
| `HOUSEKEEPING_DONE` | `pms-housekeeping-done` | 智能 PMS 操作请求表/保洁任务表 | 写入完成请求 | 保洁任务转待查，房间清洁状态转待查 | 中 |
| `INSPECTION_PASS` | `pms-inspection-result` | 智能 PMS 操作请求表 | 写入查房结果 | 房间转干净；若空房且可售则派生 VC | 中 |
| `INSPECTION_FAIL` | `pms-inspection-result` | 智能 PMS 操作请求表 | 写入返工原因 | 创建/更新返工任务，通知保洁 | 中 |
| `REPORT_MAINTENANCE` | `pms-maintenance-report` | 智能 PMS 操作请求表/工程维修表 | 写入报修请求 | 创建工单；停卖类房间转 OOO | 高 |
| `MAINTENANCE_CLOSE` | `pms-maintenance-close` | 智能 PMS 操作请求表 | 写入维修完成请求 | 工程转待验收；房间不直接 VC | 高 |
| `CHANGE_ROOM` | `pms-change-room` | 智能 PMS 操作请求表 | 写入换房申请 | 原房转空脏/待查，新房转在住，订单更新 | 高 |
| `EXTEND_STAY` | `pms-extend-stay` | 智能 PMS 操作请求表 | 写入延住申请 | 更新订单离店日，冲突检查 | 高 |
| `CHECK_IN` | `pms-checkin` | 后续版本 | 暂不建议第一批实现 | 订单转入住，房间转在住 | 高 |

## 7. 推荐实施顺序

短期只做低风险增量：

1. **完成 Wave 0**：本文件作为 roadmap SSOT。
   达成目标：后续任务有统一边界，不再讨论是否要大重构。

2. **执行 Wave 1 + Wave 2**：配置和文档优先。
   达成目标：无需改核心代码即可跑通 PMS smart intake 的目标 schema。

3. **执行 Wave 3**：先补测试锁边界。
   达成目标：证明多 PMS formKey 仍只是 managed routing，不污染 adapter core。

4. **执行 Wave 4**：跑通 sandbox Feishu 写入闭环。
   达成目标：`CHECK_OUT` / `REPORT_MAINTENANCE` / `HOUSEKEEPING_DONE` 三个动作落表。

5. **评估是否进入 Wave 5/6**。
   达成目标：只有当飞书自动化不足时，才引入 read/update seam 和 adapter-side workflow。

## 8. 每阶段通用 done_when

任一实现 wave 完成时必须满足：

- `npm run verify` 通过。
- README / architecture / runbook 没有边界冲突。
- 新增 env/config 有 `.env.example` 或 runbook 说明。
- 不提交真实 Feishu tenant ID、token、app secret、table/form ID。
- PMS 业务字段不进入 provider-neutral core contracts。
- 若新增 API contract，必须有 success + stable failure tests。
- 若新增 Feishu API wrapper，必须通过本地 seam 测试 SDK success/error normalization。
- 若涉及真实 Feishu，必须记录 sandbox smoke evidence 和失败恢复方式。

## 9. 风险与控制

| 风险 | 表现 | 控制策略 |
|---|---|---|
| 边界漂移 | adapter 变 PMS monolith / MCP runtime | 业务逻辑进入 provider/module；MCP 外置；core 不接 PMS nouns |
| Schema drift | 飞书表字段改名/隐藏/required 变化导致写入失败 | 默认开启 schema preflight；测试 drift；runbook 写清楚错误 |
| Raw target 滥用 | 调用方传目标表导致越权/误写 | managed mode 禁止 target；legacy override 只作为 escape hatch |
| 重复提交 | 同一操作多次落表 | UUIDv4 `clientToken` + dedupe；后续可查 operation request 幂等键 |
| 多实例并发 | in-process queue 不能跨实例串行 | pilot 单实例；多实例前单独设计外部 queue/lock |
| 敏感数据 | 客人隐私/手机号/证件进入 Base | 字段设计只存必要/脱敏信息；权限由 Base 高级权限控制 |
| 高风险操作误执行 | Agent 直接停卖/换房/延住 | `confirm=true`、审批字段、经理确认、操作日志 |
| 飞书权限不足 | record_create_failed/schema_validation_failed | runbook 明确 app 权限和 Base sharing 检查 |

## 10. 下一步建议

Wave 1-3 的独立 execution pack 已完成并归档：

```text
docs/archive/plan/adapter-feishu-pms-smart-intake-v1-2026-04-24_PLAN.md
docs/archive/plan/adapter-feishu-pms-smart-intake-v1-2026-04-24_STATUS.md
docs/archive/plan/adapter-feishu-pms-smart-intake-v1-2026-04-24_WORKSET.md
docs/archive/plan/adapter-feishu-pms-smart-intake-v1-2026-04-24_CLOSEOUT.md
```

已完成范围只覆盖 Wave 1-3，未直接进入 workflow 状态机：

```text
S1: 增加 PMS registry example 和 docs mapping
S2: 增加 PMS Base setup contract
S3: 补 PMS managed routing tests，证明 CHECK_OUT / REPORT_MAINTENANCE / HOUSEKEEPING_DONE smart intake
```

该 pack 的完成证据：

```text
- 未改变 adapter core boundary
- 多 PMS formKey 可通过 registry 表达
- PMS Base setup contract 足够 operator 创建 sandbox Base
- npm run verify 通过
- 真实 Feishu sandbox smoke 仍 defer 到 Wave 4 或 successor pack
```
