# adapter-feishu form webhook poc v1 workset

- plan_id: `adapter-feishu-form-webhook-poc-v1-2026-04-23`
- plan_class: `execution-plan`
- status: `ready`
- queue_mode: `strict-serial`
- active_wave: `implementation`
- active_slice: `FW1.S1`
- last_updated: `2026-04-23`

## Stage Order

- [ ] `FW1.S1` bitable client + config/auth contract freeze
- [ ] `FW1.S2` form webhook ingress + write path
- [ ] `FW1.S3` schema preflight + serialized write safety
- [ ] `FW1.S4` docs + verification + closeout baseline

## Active Stage

### `FW1.S1`

- Owner: `execute-plan`
- State: `READY`
- Priority: `highest`

目标：

- 落地可测试的 Bitable client seam 与 form webhook config/auth contract，使后续 server/runtime slice 可以围绕一个稳定依赖面推进

必须交付：

1. `src/channels/feishu/bitableClient.ts`
2. `src/config.ts` 与 `.env.example` 的 form-webhook config
3. `test/channels/feishu/bitableClient.test.ts`
4. 必要的 `test/config.test.ts` / export wiring

done_when:

1. wrapper seam 已覆盖 `createRecord / getForm / listFormFields`
2. config 已明确 `ADAPTER_FEISHU_FORM_*` contract 与 override gate
3. 当前 slice 完成后，`FW1.S2` 可直接消费该 seam 而无需重新讨论 client contract

stop_boundary:

1. 不把 HTTP ingress / runtime wiring 混进本 slice
2. 不把 queue/preflight/attachment 支持提前带入本 slice
3. 若 execution 发现 target contract 仍有多个 equally-primary 方案竞争，停止并回 `plan-creator`

必须避免：

1. form POC 污染 shared message-delivery core nouns
2. runtime/server 直接依赖 SDK raw payload shape

## Slice Ownership

### `FW1.S1`

- `src/channels/feishu/bitableClient.ts`
- `src/config.ts`
- `.env.example`
- `src/index.ts` / `src/channels/feishu/*` export seam as needed
- `test/channels/feishu/bitableClient.test.ts`
- `test/config.test.ts`

### `FW1.S2`

- `src/server/formWebhook.ts`
- `src/server/httpHost.ts`
- `src/server/index.ts`
- `src/runtime.ts`
- `test/server/formWebhook.test.ts`
- `test/server/httpHost.test.ts`
- `test/runtime.test.ts`

### `FW1.S3`

- `src/channels/feishu/bitableClient.ts`
- `src/state/tableWriteQueue.ts` (if needed)
- `src/server/formWebhook.ts`
- `test/state/tableWriteQueue.test.ts` (if needed)
- `test/server/formWebhook.test.ts`

### `FW1.S4`

- `docs/runbook/adapter-feishu-form-integration.md`
- `README.md`
- `.env.example`
- `docs/plan/*` status writeback

## Expected Verification

- `npm test -- test/channels/feishu/bitableClient.test.ts test/config.test.ts`
- `npm test -- test/server/formWebhook.test.ts test/server/httpHost.test.ts test/runtime.test.ts`
- `npm test -- test/state/tableWriteQueue.test.ts` (if queue introduced)
- `npm run verify`

## Execution Notes

- Feishu API reality for this pack is already bounded: record create is the primary write surface; form get/list is optional preflight support
- same-table write conflict is a real upstream constraint; do not assume optimistic parallel writes are safe
- keep this pack single-root under `docs/plan/*`; do not create a second shadow roadmap outside the active pack
- under extension autopilot, the active stage ID is the `stepId` for active-slice reports
- review routes to `execution-reality-audit`; closeout uses the repo-local closeout prompt surface
