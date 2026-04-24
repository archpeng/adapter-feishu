# adapter-feishu PMS Smart Intake v1 2026-04-24 Workset

## Stage Order

- [ ] `S1` PMS managed form registry and runbook contract
- [ ] `S2` PMS Base schema and view contract
- [ ] `S3` test-first PMS managed routing hardening

## Active Stage

### `S1`

- Owner: `execute-plan`
- State: `READY`
- Priority: `highest`

目标：

- Establish the PMS smart-intake `formKey` contract on top of existing managed form routing, without changing adapter core behavior.

必须交付：

1. Placeholder-only PMS registry example with at least `pms-checkout`, `pms-maintenance-report`, and `pms-housekeeping-done` bindings.
2. Each binding uses server-side `target`, business-key `fieldMap`, `fixedFields` including `Source`, `Ingress`, `Action`, and `SchemaVersion`, and strict managed policy.
3. Runbook/docs state that callers send only `formKey + clientToken + fields`; managed mode rejects raw caller `target`.

验证：

1. Example registry JSON parses locally and contains no real-looking secret/app credential values.
2. `npm test -- test/docs-boundary.test.ts test/config.test.ts test/runtime.test.ts` passes if those surfaces are touched.
3. `git diff --check` passes.

done_when:

1. A PMS registry example exists and names the first three PMS smart-intake formKeys: `pms-checkout`, `pms-maintenance-report`, and `pms-housekeeping-done`.
2. The docs/runbook explain the managed payload shape and fixed-field action semantics for those formKeys.
3. No `src/core/**`, `src/server/httpHost.ts`, or PMS workflow/state-machine logic was changed for S1.

stop_boundary:

1. Stop before adding Bitable read/update/search APIs.
2. Stop before implementing room-state transitions or housekeeping task creation.
3. Stop and replan if PMS formKey routing cannot be represented through the existing registry contract.

必须避免：

1. Committing real Feishu appToken/tableId/formId/secrets.
2. Treating legacy raw `target` override as the preferred PMS path.
3. Changing provider-neutral contracts to include PMS-specific fields.

## Slice Ownership

### `S1`

- `config/pms-form-bindings.example.json` or equivalent PMS registry example
- `docs/runbook/adapter-feishu-form-integration.md`
- `test/docs-boundary.test.ts` if docs/example anchors are asserted
- `test/config.test.ts` / `test/runtime.test.ts` only if example loading or config behavior changes

### `S2`

- `docs/roadmap/pms-base-schema.md` or `docs/runbook/adapter-feishu-pms-base-setup.md`
- `docs/runbook/adapter-feishu-form-integration.md` cross-links if needed
- `test/docs-boundary.test.ts` if the schema doc becomes a boundary anchor

### `S3`

- `test/server/formWebhook.test.ts`
- `test/runtime.test.ts`
- `test/config.test.ts`
- `test/docs-boundary.test.ts`
- only minimal production code if tests reveal an existing managed-routing bug

## Expected Verification

- S1: JSON parse check for PMS registry example; `npm test -- test/docs-boundary.test.ts test/config.test.ts test/runtime.test.ts` if touched; `git diff --check`.
- S2: doc readback proves all required tables/views/formKey mappings are present and placeholder-only.
- S3: `npm test -- test/server/formWebhook.test.ts test/docs-boundary.test.ts`; `npm run verify`; `git diff --check`.

## Execution Notes

- Under extension autopilot, the active stage ID `S1` is the `stepId` for active-slice reports.
- Keep `docs/plan/*` as the single-root parser truth.
- Do not make “ask whether to continue” the default stop rule; use the active stage `done_when` / `stop_boundary`.
- Review routes to `execution-reality-audit`; closeout uses the repo-local closeout prompt surface.
- This pack covers roadmap Wave 1-3 only; defer Wave 4 sandbox Feishu smoke to a successor pack or explicit replan.
