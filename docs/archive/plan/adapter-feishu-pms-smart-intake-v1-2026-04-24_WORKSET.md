# adapter-feishu PMS Smart Intake v1 2026-04-24 Workset

## Stage Order

- [x] `S1` PMS managed form registry and runbook contract
- [x] `S2` PMS Base schema and view contract
- [x] `S3` test-first PMS managed routing hardening

## Active Stage

- none; pack complete
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

- Under extension autopilot, the active stage ID `S3` is the `stepId` for active-slice reports.
- Keep `docs/plan/*` as the single-root parser truth.
- Do not make “ask whether to continue” the default stop rule; use the active stage `done_when` / `stop_boundary`.
- Review routes to `execution-reality-audit`; closeout uses the repo-local closeout prompt surface.
- This pack covers roadmap Wave 1-3 only; defer Wave 4 sandbox Feishu smoke to a successor pack or explicit replan.

## Machine Queue

- active_step: `PACK_COMPLETE`
- latest_completed_step: `S3`
- intended_handoff: `execution-reality-audit`
- latest_closeout_summary: S3 executed: PMS managed-routing hardening tests added and full verification passed.
- latest_verification:
  - `Added tests loading config/pms-form-bindings.example.json and routing pms-checkout, pms-maintenance-report, and pms-housekeeping-done through registry fieldMap/fixedFields with schema validation.`
  - `Added PMS failure-mode coverage for target shielding, unknown formKey, disabled formKey, unmapped field, fixed-field conflict, schema drift, schema_validation_failed, and managed duplicate handling.`
  - `npm test -- test/server/formWebhook.test.ts test/docs-boundary.test.ts passed: 2 files, 23 tests.`
  - `npm run verify passed: build plus 26 test files, 84 tests; git diff --check passed.`
  - `plan_sync shows STATUS and WORKSET with S1-S3 done and 0 pending; changed-path inspection found no forbidden implementation changes.`
  - `test/server/formWebhook.test.ts`
  - `docs/plan/README.md`
  - `docs/plan/adapter-feishu-pms-smart-intake-v1-2026-04-24_STATUS.md`
  - `docs/plan/adapter-feishu-pms-smart-intake-v1-2026-04-24_WORKSET.md`
- terminal: `true`