# adapter-feishu managed form routing v1 workset

- plan_id: `adapter-feishu-managed-form-routing-v1-2026-04-24`
- plan_class: `execution-plan`
- status: `active`
- queue_mode: `strict-serial`
- active_wave: `wave-1 / contract freeze`
- active_slice: `MFR1.S1`
- last_updated: `2026-04-24`

## Stage Order

- [ ] `MFR1.S1` registry contract + startup parsing freeze
- [ ] `MFR1.S2` managed formKey routing + mapping write path
- [ ] `MFR1.S3` docs, example bindings, and regression baseline
- [ ] `MFR1.S4` live managed proof + closeout-ready writeback

## Active Stage

### `MFR1.S1`

- Owner: `execute-plan`
- State: `READY`
- Priority: `highest`

目标：

- 先把 managed form registry contract 冻结住，保证后续执行围绕单一、可测试、可 handoff 的 binding truth 前进

必须交付：

1. `ADAPTER_FEISHU_FORM_REGISTRY_PATH` env contract
2. `src/forms/registry.ts` load/parse/validation seam
3. `config/form-bindings.example.json`
4. targeted config/runtime proof

done_when:

1. startup 能稳定处理“无 registry -> legacy-only”与“有 registry -> managed mode available”两类路径
2. invalid registry 会 fail fast，valid example registry 能被 load
3. `MFR1.S2` 不需要再回头争论 registry 基本 contract

stop_boundary:

1. 本 stage 完成前不去改 `formWebhook` request-routing 行为
2. 若 registry contract 被证明必须承载 value transform / live admin editing，则停止并回 `plan-creator` replan

必须避免：

1. 用 environment variable matrix 伪装多表单 registry
2. 把 example registry 写成依赖私有 tenant secrets 的 tracked config

## Slice Ownership

### `MFR1.S1`

- `src/config.ts`
- `src/forms/registry.ts`
- `.env.example`
- `config/form-bindings.example.json`
- `test/config.test.ts`
- `test/runtime.test.ts`

## Expected Verification

- `npm test -- test/config.test.ts test/runtime.test.ts`
- if a dedicated registry test file is introduced during execution, include it in the targeted validation for this stage

## Queued Stages

### `MFR1.S2`

- Owner: `execute-plan`
- State: `queued`
- Priority: `high`
- summary: add `formKey` managed routing, fieldMap conversion, fixedFields injection, and stable managed-mode errors while preserving legacy mode
- done_when:
  1. `POST /providers/form-webhook` accepts `formKey + fields` managed requests without requiring caller-supplied raw `target`
  2. managed mode reuses existing schema validation / dedupe / write queue path
  3. legacy mode remains compatible and covered by tests
- stop_boundary:
  1. do not expand into value coercion DSL, option lookup, attachment upload, or field auto-create

### `MFR1.S3`

- Owner: `execute-plan`
- State: `queued`
- Priority: `high`
- summary: align README, runbook, env contract, and example registry with the new managed routing truth
- done_when:
  1. operator docs explain `formKey` onboarding from zero without hidden chat context
  2. `.env.example` and example registry support local/container startup
  3. `npm run verify` passes
- stop_boundary:
  1. do not add new product behavior in a docs slice just because the docs expose a missing idea

### `MFR1.S4`

- Owner: `execute-plan`
- State: `queued`
- Priority: `medium`
- summary: prove one real managed binding on current repo code or capture blocker evidence honestly before review
- done_when:
  1. at least one live managed request has proof, or an external blocker has been evidence-backed and written back to the pack
  2. the workstream is ready for `execution-reality-audit`
- stop_boundary:
  1. do not substitute a legacy target-based request for a managed proof
  2. do not respond to tenant-specific blockers by silently expanding scope into form control-plane work

## Execution Notes

- this pack remains single-root machine truth under `docs/plan/*`
- under extension autopilot semantics, the active stage ID `MFR1.S1` is the `stepId` for active-slice reports
- skill-backed phases require `read` and `autopilot_report`
- do not make “ask whether to continue” the default stop rule; use the active stage `done_when` / `stop_boundary`
- review routes to `execution-reality-audit`; closeout uses the repo-local closeout prompt surface
