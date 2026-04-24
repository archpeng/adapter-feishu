# adapter-feishu managed form routing v1 workset

- plan_id: `adapter-feishu-managed-form-routing-v1-2026-04-24`
- plan_class: `execution-plan`
- status: `active`
- queue_mode: `strict-serial`
- active_wave: `wave-4 / live managed proof`
- active_slice: `MFR1.S4`
- last_updated: `2026-04-24`

## Stage Order

- [x] `MFR1.S1` registry contract + startup parsing freeze
- [x] `MFR1.S2` managed formKey routing + mapping write path
- [x] `MFR1.S3` docs, example bindings, and regression baseline
- [x] `MFR1.S4` live managed proof + closeout-ready writeback

## Active Stage

- none; pack complete
## Slice Ownership

### `MFR1.S1`

- `src/config.ts`
- `src/forms/registry.ts`
- `.env.example`
- `config/form-bindings.example.json`
- `test/config.test.ts`
- `test/runtime.test.ts`

### `MFR1.S2`

- `src/server/formWebhook.ts`
- `src/runtime.ts`
- `test/server/formWebhook.test.ts`
- `test/runtime.test.ts`

### `MFR1.S3`

- `README.md`
- `docs/runbook/adapter-feishu-form-integration.md`
- `.env.example`
- `test/docs-boundary.test.ts`

### `MFR1.S4`

- local untracked or mounted managed registry file for real target proof
- current-code runtime process and live `POST /providers/form-webhook` probe evidence
- `docs/plan/adapter-feishu-managed-form-routing-v1-2026-04-24_STATUS.md`
- `docs/plan/adapter-feishu-managed-form-routing-v1-2026-04-24_WORKSET.md`

## MFR1.S1 Execution Result

- implemented `ADAPTER_FEISHU_FORM_REGISTRY_PATH` as an optional config path; unset keeps legacy-only startup
- added `src/forms/registry.ts` with fail-fast load/parse/validation for `version: 1` and `forms[formKey]` bindings
- added placeholder-only `config/form-bindings.example.json`
- wired `src/runtime.ts` to load the registry at runtime creation and expose the parsed `formRegistry` seam consumed by `MFR1.S2`

## Expected Verification

- `npm test -- test/config.test.ts test/runtime.test.ts` -> passed, 2 files / 13 tests
- `npm run build` -> passed
- `npm run verify` -> passed, 26 files / 73 tests
- `git diff -- src/server/formWebhook.ts --exit-code` -> passed, no routing diff in `MFR1.S1`
- `npm test -- test/server/formWebhook.test.ts test/runtime.test.ts test/config.test.ts` -> passed, 3 files / 31 tests for `MFR1.S2`
- `npm run verify` -> passed, 26 files / 79 tests after `MFR1.S2`
- `npm test -- test/docs-boundary.test.ts` -> passed, 1 file / 2 tests for `MFR1.S3`
- `npm test -- test/docs-boundary.test.ts test/config.test.ts test/runtime.test.ts test/server/formWebhook.test.ts` -> passed, 4 files / 33 tests for `MFR1.S3`
- `npm run verify` -> passed, 26 files / 80 tests after `MFR1.S3`
- `MFR1.S4` live success path -> start current-code runtime with untracked real registry and capture managed `POST /providers/form-webhook` request/response evidence: no raw `target`, `targetSource: "managed"`, `record_created`
- `MFR1.S4` blocker path -> capture explicit external condition evidence in STATUS/WORKSET, such as missing env, missing permission, target visibility failure, or schema mismatch; do not expand into transforms/field patch/control-plane capability
- if `MFR1.S4` changes code/docs beyond residual writeback, rerun `npm run verify`; otherwise preserve latest verify and the focused live probe/blocker evidence
- `MFR1.S4` build validation -> passed: `npm run build`
- `MFR1.S4` live discovery -> Feishu table/form metadata was readable from current credentials/default target; placeholder Title/Severity mapping returned upstream `FieldNameNotFound`, so proof binding was adjusted to an existing table text field without expanding product scope
- `MFR1.S4` live proof -> untracked registry `/tmp/adapter-feishu-mfr1-s4.da7S1s/managed-form-registry.json`, `ADAPTER_FEISHU_PORT=8788`, managed request shape `formKey + clientToken + fields` with no raw `target`
- `MFR1.S4` live proof -> HTTP 200, `status: record_created`, `recordId: recvhHryamOica`, `targetSource: managed`, sanitized target redacted

## MFR1.S2 Execution Result

- implemented managed `formKey + fields` request handling on the existing `/providers/form-webhook` endpoint
- registry binding resolution shields managed target selection by rejecting caller-supplied `target` and using the server-side binding `target`
- business fields are mapped through `fieldMap`; `fixedFields` are merged after mapping and protected from caller override
- managed requests reuse the existing schema validation, dedupe, table write queue, and record create path
- stable managed invalid-payload errors now cover registry not configured, unknown formKey, disabled formKey, managed target override, unmapped fields, and fixed-field conflicts
- legacy default/override mode remains covered and compatible when `formKey` is omitted

## MFR1.S3 Execution Result

- `README.md` now presents managed `formKey` mode as the preferred multi-form handoff and keeps legacy raw target override framed as an escape hatch
- `docs/runbook/adapter-feishu-form-integration.md` now documents managed registry contract, request examples, mapping/fixedFields behavior, stable managed errors, startup failure modes, and troubleshooting
- `.env.example` now shows how to point `ADAPTER_FEISHU_FORM_REGISTRY_PATH` at the placeholder example without committing private tenant secrets
- `test/docs-boundary.test.ts` now guards managed-routing docs/runbook/env/example-registry anchors

## Queued Stages

- none; `MFR1.S4` is completed pending `execution-reality-audit` review.

## Completed Pending Review

### `MFR1.S4`

- Owner: `execution-reality-audit`
- State: `completed_pending_review`
- Priority: `highest`
- summary: live managed proof succeeded on current repo code with a real untracked managed binding and managed-only request
- evidence:
  1. one real local registry binding was assembled outside tracked config at `/tmp/adapter-feishu-mfr1-s4.da7S1s/managed-form-registry.json`
  2. the request body used `formKey: mfr1-live`, `clientToken`, and `fields` only; no raw `target` override was sent
  3. current-code runtime on `127.0.0.1:8788` returned HTTP 200, `status: record_created`, `recordId: recvhHryamOica`, and `targetSource: managed`
  4. no value transform, field patch, schema control, or form control-plane capability was added

## Execution Notes

- this pack remains single-root machine truth under `docs/plan/*`
- under extension autopilot semantics, the active stage ID `MFR1.S4` is the `stepId` for active-slice reports until review accepts this slice and advances the queue
- skill-backed phases require `read` and `autopilot_report`
- do not make “ask whether to continue” the default stop rule; use the active stage `done_when` / `stop_boundary`
- review routes to `execution-reality-audit`; closeout uses the repo-local closeout prompt surface

## Machine Queue

- active_step: `PACK_COMPLETE`
- latest_completed_step: `MFR1.S4`
- intended_handoff: `execution-reality-audit`
- latest_closeout_summary: MFR1.S4 live managed proof succeeded and was written back.
- latest_verification:
  - `Read execute-plan skill and execution control-plane reference; active slice remained MFR1.S4`
  - `Project-local .env had Feishu app credentials plus default form target variables; no tenant values were written to tracked config`
  - `Schema/resource discovery confirmed the real target table/form metadata was readable; placeholder Title/Severity mapping first returned upstream FieldNameNotFound and was corrected to an existing text table field`
  - `Current-code runtime on 127.0.0.1:8788 used an untracked registry for formKey mfr1-live and received a managed-only request with formKey+clientToken+fields and no raw target`
  - `Live POST /providers/form-webhook returned HTTP 200 record_created, recordId recvhHryamOica, targetSource managed, with target values redacted in captured evidence`
  - `plan_sync now shows STATUS/WORKSET at 4 done / 0 pending`
  - `Validation passed: npm run build; npm test -- test/docs-boundary.test.ts; git diff --check`
  - `/tmp/adapter-feishu-mfr1-s4.da7S1s/managed-form-registry.json`
  - `docs/plan/README.md`
  - `docs/plan/adapter-feishu-managed-form-routing-v1-2026-04-24_STATUS.md`
  - `docs/plan/adapter-feishu-managed-form-routing-v1-2026-04-24_WORKSET.md`
- terminal: `true`