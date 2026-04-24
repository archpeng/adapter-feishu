下面是一套可以落地的方案。我把它设计成 **“飞书多维表格 + 表单视图 + 自动化 + Bot 通知 + Codex/MCP Adapter”** 的轻量智能 PMS，重点服务 **客房房态管理、保洁派单、工程停卖、前台退房/换房/延住、经理看板**。

我也整理了一个 TypeScript MCP Adapter 脚手架，包含飞书 API Client、PMS 状态机、MCP tools、Codex 配置示例和多维表格建表文档：
[下载 Feishu PMS Adapter 脚手架](sandbox:/mnt/data/feishu-pms-adapter.zip)

---

## 1. 核心判断：不要让 Codex “模拟人工填表”，而是写入表单底表

飞书多维表格的表单视图本质上是把表单提交自动汇总到多维表格中；也就是说，真正稳定的数据入口是 **Base 里的数据表记录**，不是浏览器里的表单页面。飞书官方文档也说明，表单视图用于收集信息和数据，收集后自动汇总到多维表格。([Lark][1])

所以我建议这样做：

```text
Codex / Agent
  ↓ MCP 工具调用
Feishu PMS Adapter
  ↓ 新增一条“智能PMS操作请求”记录
飞书多维表格：智能PMS操作请求表
  ↓ Adapter 状态机 / 飞书自动化 / 人工审批
房间台账、保洁任务、工程维修、预订订单、操作日志
```

这样既满足“让 Codex 调用 Adapter 在飞书里填写智能表单”，又避免了用浏览器自动化去点表单造成的不稳定。飞书 Base API 本身就是为系统集成、数据实时更新设计的；记录 API 支持新增、更新、查询记录，适合直接作为 Adapter 的写入层。([Feishu Open Platform][2])

---

## 2. 推荐总体架构

```text
┌──────────────────────────────────────┐
│ Codex / ChatGPT / Agent               │
│ - 识别自然语言意图                    │
│ - 调用 MCP Tool                       │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ Feishu PMS Adapter                    │
│ - MCP Server / 可选 HTTP Server        │
│ - 飞书 Token 管理                     │
│ - 字段映射与参数校验                  │
│ - 房态状态机                          │
│ - 幂等、防重、审计日志                │
│ - 高风险操作 confirm / dryRun         │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 飞书多维表格 Base                     │
│ 1. 智能PMS操作请求                    │
│ 2. 房间台账                           │
│ 3. 预订订单                           │
│ 4. 保洁任务                           │
│ 5. 工程维修                           │
│ 6. 操作日志                           │
│ 7. 房型库存日历                       │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ 飞书协作层                            │
│ - 表单视图：前台、保洁、工程提交      │
│ - 看板视图：房态墙、保洁任务板        │
│ - 日历/甘特：预抵预离、维修排程       │
│ - 仪表盘：可售数、脏房数、OOO、SLA    │
│ - 自动化：数据变化后发消息/改状态     │
│ - Bot：异常提醒、审批、日报           │
└──────────────────────────────────────┘
```

Codex 侧建议用 MCP 接入。Codex 文档显示，MCP 用于把模型连接到工具和上下文，Codex CLI 与 IDE extension 都支持 MCP Server；配置可以通过 `codex mcp add` 或 `~/.codex/config.toml` 完成，并支持本地 STDIO Server 与 HTTP Server。([OpenAI Developers][3])

---

## 3. PMS 数据模型：不要只用一个“房态”字段

传统 PMS 常见房态码有 VC、VD、OC、OD、OOO、OOS 等，但如果只用一个字段，后续会很难扩展。建议把房态拆成三个维度：

```text
占用状态：空房 / 预抵 / 在住 / 预离
清洁状态：干净 / 脏房 / 清扫中 / 待查 / 返工
可售状态：可售 / 停售维修 / 停售保留 / 停售自用
```

然后由 Adapter 或公式字段派生：

| 房态码 | 含义                     | 推导逻辑             |
| --- | ---------------------- | ---------------- |
| VC  | Vacant Clean 空净        | 空房 + 干净 + 可售     |
| VD  | Vacant Dirty 空脏        | 空房 + 脏房 + 可售     |
| OC  | Occupied Clean 住净      | 在住 + 干净          |
| OD  | Occupied Dirty 住脏      | 在住 + 非干净         |
| ARR | 预抵                     | 占用状态 = 预抵        |
| DEP | 预离                     | 占用状态 = 预离        |
| CLN | 清扫中                    | 清洁状态 = 清扫中       |
| INS | 待查/返工                  | 清洁状态 = 待查或返工     |
| OOO | Out of Order 工程停售      | 可售状态 = 停售维修      |
| OOS | Out of Service 保留/自用停售 | 可售状态 = 停售保留/停售自用 |

这样做的好处是：前台看“占用”，保洁看“清洁”，收益/经理看“可售”，工程看“停售”，每个角色都有自己的视角。

---

## 4. 多维表格建表设计

### A. 房间台账

这是房态系统的核心表。

| 字段     | 类型建议    | 说明                |
| ------ | ------- | ----------------- |
| 房号     | 文本/索引字段 | 唯一键               |
| 门店     | 单选/关联   | 多门店时使用            |
| 楼层     | 单选/文本   | 房态墙按楼层分组          |
| 房型     | 单选/关联   | 标准间、大床房、套房等       |
| 占用状态   | 单选      | 空房/预抵/在住/预离       |
| 清洁状态   | 单选      | 干净/脏房/清扫中/待查/返工   |
| 可售状态   | 单选      | 可售/停售维修/停售保留/停售自用 |
| 房态码    | 单选/公式   | VC/VD/OC/OD/OOO 等 |
| 当前订单号  | 文本/关联   | 指向预订订单            |
| 最近变更原因 | 长文本     | 每次变更必须写原因         |
| 最近操作人  | 人员/文本   | 操作追踪              |
| 最后更新时间 | 日期时间    | 审计与排序             |

### B. 智能 PMS 操作请求

这张表就是“智能表单”的底表。Codex、飞书表单、机器人都写它。

| 字段        | 说明                                                    |
| --------- | ----------------------------------------------------- |
| 请求编号      | 幂等主键                                                  |
| 来源        | codex / feishu_form / bot / api                       |
| 动作        | CHECK_OUT / CHANGE_ROOM_STATUS / REPORT_MAINTENANCE 等 |
| 状态        | 待处理 / 处理中 / 已完成 / 失败 / 需人工确认                          |
| 请求JSON    | 原始结构化参数                                               |
| 幂等键       | 防止重复提交                                                |
| 操作员       | 谁提交                                                   |
| 结果JSON    | 执行结果                                                  |
| 错误信息      | 失败原因                                                  |
| 创建时间/完成时间 | 审计                                                    |

### C. 保洁任务

| 字段        | 说明                     |
| --------- | ---------------------- |
| 任务号       | HK-...                 |
| 房号        | 对应房间                   |
| 任务类型      | 退房清扫/续住清扫/夜床/补物品/返工/查房 |
| 状态        | 待派单/已派单/清扫中/待查房/已完成/返工 |
| 优先级       | 低/中/高/紧急               |
| 指派保洁      | 人员                     |
| 实际开始/完成时间 | SLA 统计                 |
| 图片/附件     | 异常照片                   |
| 查房人       | 质检责任人                  |

### D. 工程维修

| 字段     | 说明              |
| ------ | --------------- |
| 工单号    | MT-...          |
| 房号     | 对应房间            |
| 类别     | 空调/水电/门锁/网络/其他  |
| 严重程度   | 低/中/高/停卖        |
| 是否停卖   | true 时房间转 OOO   |
| 状态     | 待处理/处理中/待验收/已完成 |
| 预计恢复时间 | 经理看停售恢复         |
| 图片/附件  | 问题照片            |

### E. 预订订单

| 字段      | 说明                   |
| ------- | -------------------- |
| 订单号     | 渠道订单或内部订单            |
| 渠道      | 直客/OTA/协议/团队         |
| 客人姓名    | 建议脱敏展示               |
| 手机号后四位  | 避免存完整敏感信息            |
| 到店/离店日期 | 入住周期                 |
| 房型/房号   | 房型库存与分房              |
| 状态      | 预订/已入住/已离店/取消/NoShow |
| 房价      | ADR/RevPAR 统计        |

### F. 操作日志

所有 Adapter 写操作必须留痕。

| 字段     | 说明                              |
| ------ | ------------------------------- |
| 时间     | 操作时间                            |
| 动作     | CHECK_OUT 等                     |
| 来源     | pms-adapter / feishu_form / bot |
| 幂等键    | 防重复                             |
| 操作员    | 谁操作                             |
| 详情JSON | 前后状态、入参、出参                      |

---

## 5. 飞书能力怎么充分利用

### 表单视图：移动端轻量录入

给不同岗位做不同表单：

| 表单        | 使用人   | 写入动作                              |
| --------- | ----- | --------------------------------- |
| 前台退房表单    | 前台    | CHECK_OUT                         |
| 换房/延住表单   | 前台/经理 | CHANGE_ROOM / EXTEND_STAY         |
| 保洁完成表单    | 保洁    | HOUSEKEEPING_DONE                 |
| 查房通过/返工表单 | 主管    | INSPECTION_PASS / INSPECTION_FAIL |
| 工程报修表单    | 任意员工  | REPORT_MAINTENANCE                |
| 停卖恢复表单    | 工程/经理 | MAINTENANCE_CLOSE                 |

### 自动化：低代码触发协作

飞书多维表格自动化可以设定触发条件和执行操作，并在数据变化后自动执行下一步，很适合做“退房后通知保洁”“工程停卖后通知经理”“查房通过后通知前台可售”。([Lark][4])

### 仪表盘：经理驾驶舱

飞书多维表格仪表盘可以从不同维度统计并用图表展示数据；这里可以做总房数、可售数、脏房数、OOO 数、今日预抵/预离、保洁平均耗时、工程超时工单。([Lark][5])

### 高级权限：分角色隔离

多维表格高级权限支持按角色控制数据表的行列阅读/编辑权限，适合把前台、保洁、工程、经理隔离开。保洁只看自己的任务，工程只看维修，前台不能改工程验收字段。([Lark][6])

### Bot 消息：异常提醒与审批

飞书消息 API 支持向用户或群聊发送文本、图片、视频等消息；工程停卖、超时未清扫、查房返工、超售风险都应该通过 Bot 推送。([Feishu Open Platform][7])

---

## 6. Adapter 对外暴露的 MCP Tools

我在脚手架里设计了这些工具：

```text
pms_get_room
读取单间客房当前房态。

pms_write_smart_form
向“智能PMS操作请求”表写入结构化表单提交。
这是最符合“Codex 填写飞书智能表单”的入口。

pms_change_room_status
变更房态，支持 dryRun 预览和 confirm 确认。

pms_check_out
办理退房：房间变空脏，并自动创建退房清扫任务。

pms_create_housekeeping_task
创建保洁/查房/返工任务。

pms_report_maintenance
创建工程工单；严重程度为停卖时自动把房间设为 OOO。

pms_dashboard
聚合当前房态数量。
```

高风险写操作默认要求：

```json
{
  "confirm": true,
  "idempotencyKey": "CHECKOUT-20260424-0808"
}
```

并且可以先 dry run：

```json
{
  "roomNo": "0808",
  "clean": "待查",
  "reason": "保洁提交清扫完成，等待查房",
  "dryRun": true
}
```

这样可以让 Codex 先展示“计划变更”，你确认后再执行。

---

## 7. 关键业务流程

### 退房流程

```text
前台/Codex 提交 CHECK_OUT
  ↓
校验：房间必须是 在住 或 预离
  ↓
房间台账：占用状态=空房，清洁状态=脏房
  ↓
自动创建保洁任务：退房清扫，高优先级
  ↓
通知保洁群
  ↓
操作日志落库
```

### 保洁完成流程

```text
保洁提交 HOUSEKEEPING_DONE 表单
  ↓
房间：清洁状态=待查
  ↓
保洁任务：状态=待查房
  ↓
通知查房主管
```

### 查房通过流程

```text
查房主管提交 INSPECTION_PASS
  ↓
房间：清洁状态=干净
  ↓
如果 占用状态=空房 且 可售状态=可售
  ↓
派生房态码=VC，进入可售池
```

### 工程报修停卖流程

```text
员工提交 REPORT_MAINTENANCE
  ↓
创建工程工单
  ↓
如果 severity=停卖 或 stopSell=true
  ↓
房间：可售状态=停售维修，房态码=OOO
  ↓
通知工程群和经理
```

### 维修完成流程

```text
工程提交维修完成
  ↓
状态=待验收
  ↓
查房/经理验收
  ↓
房间不直接变 VC，而是进入 待查 或 脏房
  ↓
保洁/查房后再回到 VC
```

这个约束很重要：**工程维修完成不等于房间可售**，必须经过清洁/查房。

---

## 8. 飞书 API 接入要点

Adapter 需要用飞书自建应用的 `app_id` 和 `app_secret` 获取 `tenant_access_token`。官方文档说明，自建应用获取的 `tenant_access_token` 有效期为 2 小时，接口请求需要提供 `app_id` 和 `app_secret`。([Feishu Open Platform][8])

最小权限建议：

```text
多维表格记录读写：新增、查询、更新记录
多维表格字段读取：用于字段映射和校验
IM 消息发送：用于机器人通知
事件订阅/长连接：用于消息或事件触发
```

飞书事件订阅支持把事件发送到开发者服务器，也支持通过长连接接收事件；如果你希望 Adapter 实时响应飞书消息或表单相关动作，可以后续扩展事件处理器。([Feishu Open Platform][9])

---

## 9. Codex 接入方式

脚手架里有 `.codex/config.example.toml`。构建后可以这样接：

```bash
npm install
npm run build
```

然后：

```bash
codex mcp add feishu_pms \
  --env FEISHU_APP_ID=cli_xxx \
  --env FEISHU_APP_SECRET=xxx \
  --env FEISHU_APP_TOKEN=bascnxxx \
  --env FEISHU_TABLE_ROOMS=tbl_xxx \
  --env FEISHU_TABLE_RESERVATIONS=tbl_xxx \
  --env FEISHU_TABLE_HOUSEKEEPING=tbl_xxx \
  --env FEISHU_TABLE_MAINTENANCE=tbl_xxx \
  --env FEISHU_TABLE_REQUESTS=tbl_xxx \
  --env FEISHU_TABLE_LOGS=tbl_xxx \
  -- node /absolute/path/to/feishu-pms-adapter/dist/mcpServer.js
```

Codex 的 MCP 配置可以通过 CLI 添加，也可以直接写 `config.toml`；官方文档给出的 stdio server 配置方式正是 `command + args + env`。([OpenAI Developers][3])

---

## 10. 安全设计

PMS 是高风险系统，不能让 Agent 任意写房态。建议强制：

```text
1. 所有写操作必须有 reason。
2. 所有写操作必须有 idempotencyKey。
3. 默认 dryRun，真实写入要 confirm=true。
4. 停卖、取消订单、换房、强制置 VC 等动作需要经理审批。
5. 所有动作写入操作日志。
6. 不在 Base 中保存完整身份证号、银行卡、完整手机号等敏感信息。
7. Adapter 只暴露业务工具，不暴露任意“写任意表任意字段”的通用工具。
```

使用 MCP 时还要考虑提示注入风险。OpenAI 文档提醒，自定义 MCP Server 会让模型访问或操作外部应用，恶意内容可能诱导模型执行非预期动作；因此要限制工具参数、最小化权限，并谨慎处理可被外部用户写入的内容。([OpenAI Developers][10])

---

## 11. 我给你的脚手架里包含什么

下载包：
[feishu-pms-adapter.zip](sandbox:/mnt/data/feishu-pms-adapter.zip)

结构：

```text
feishu-pms-adapter/
  package.json
  tsconfig.json
  .env.example
  .codex/config.example.toml
  src/
    config.ts
    feishuClient.ts
    types.ts
    pmsAdapter.ts
    mcpServer.ts
  docs/
    BASE_SCHEMA.md
    DESIGN.md
  README.md
```

已经包含：

```text
- 飞书 tenant_access_token 缓存
- 多维表格 create/update/search record
- 飞书群文本通知
- 房态派生逻辑
- 退房流程
- 保洁任务创建
- 工程报修与停卖
- MCP tools/list 与 tools/call
- Codex 配置示例
- 多维表格字段设计文档
```

还需要你接入真实飞书环境后补齐：

```text
- 真实 app_token 和 table_id
- 字段 ID 映射，生产环境建议不要只依赖字段名
- 更完整的订单、入住、换房、延住、夜审流程
- 幂等键查重逻辑
- 单元测试和沙盒 Base 回归测试
- 经理审批流
```

我没有替你在飞书里实际创建表格和字段，因为这需要你的飞书应用凭证、企业权限和目标多维表格空间；脚手架是可以交给 Codex 继续实现和部署的起点。

[1]: https://www.feishu.cn/hc/zh-CN/articles/356120632302-%E4%BD%BF%E7%94%A8%E5%A4%9A%E7%BB%B4%E8%A1%A8%E6%A0%BC%E7%9A%84%E8%A1%A8%E5%8D%95%E8%A7%86%E5%9B%BE?utm_source=chatgpt.com "使用多维表格的表单视图"
[2]: https://open.feishu.cn/document/server-docs/docs/bitable-v1/bitable-overview?lang=zh-CN&utm_source=chatgpt.com "Base overview - 开发文档 - 飞书开放平台"
[3]: https://developers.openai.com/codex/mcp "Model Context Protocol – Codex | OpenAI Developers"
[4]: https://www.feishu.cn/hc/zh-CN/articles/665088655709-%E4%BD%BF%E7%94%A8%E5%A4%9A%E7%BB%B4%E8%A1%A8%E6%A0%BC%E8%87%AA%E5%8A%A8%E5%8C%96%E6%B5%81%E7%A8%8B?utm_source=chatgpt.com "使用多维表格自动化流程"
[5]: https://www.feishu.cn/hc/zh-CN/articles/161059314076-%E4%BD%BF%E7%94%A8%E5%A4%9A%E7%BB%B4%E8%A1%A8%E6%A0%BC%E4%BB%AA%E8%A1%A8%E7%9B%98?utm_source=chatgpt.com "使用多维表格仪表盘"
[6]: https://www.feishu.cn/hc/zh-CN/articles/588604550568-%E4%BD%BF%E7%94%A8%E5%A4%9A%E7%BB%B4%E8%A1%A8%E6%A0%BC%E9%AB%98%E7%BA%A7%E6%9D%83%E9%99%90?utm_source=chatgpt.com "使用多维表格旧版高级权限"
[7]: https://open.feishu.cn/document/server-docs/im-v1/message/create?utm_source=chatgpt.com "发送消息"
[8]: https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal?lang=zh-CN&utm_source=chatgpt.com "自建应用获取tenant_access_token - 开发文档- 飞书开放平台"
[9]: https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case?lang=zh-CN&utm_source=chatgpt.com "Receive events through websocket - 开发文档 - 飞书开放平台"
[10]: https://developers.openai.com/api/docs/mcp "Building MCP servers for ChatGPT Apps and API integrations"
