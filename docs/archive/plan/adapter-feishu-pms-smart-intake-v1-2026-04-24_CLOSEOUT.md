# adapter-feishu PMS Smart Intake v1 closeout

## Findings

- The bounded `adapter-feishu-pms-smart-intake-v1-2026-04-24` pack is fully landed, reality-audited, and closed at repo scope.
- Scope stayed within roadmap Wave 1-3:
  - PMS managed `formKey` registry/runbook contract over the existing `/providers/form-webhook` managed routing path.
  - Operator-facing Feishu Base setup contract for the light PMS smart-intake sandbox.
  - Test-first PMS managed-routing hardening for all three initial PMS formKeys and documented failure modes.
- `adapter-feishu` remains a standalone Feishu/Lark channel service and bounded record-write ingress.
- No PMS workflow/state-machine, Bitable read/update/search API, Bot approval loop, MCP runtime, or Feishu Base provisioning code was added.
- No real Feishu tenant IDs, app secrets, `appToken`, `tableId`, or `formId` values were committed; PMS target values remain obvious placeholders.

## Evidence added

- S1 config/docs proof:
  - `config/pms-form-bindings.example.json`
  - `docs/runbook/adapter-feishu-form-integration.md`
  - `test/docs-boundary.test.ts`
- S2 Base setup contract:
  - `docs/runbook/adapter-feishu-pms-base-setup.md`
  - cross-link from `docs/runbook/adapter-feishu-form-integration.md`
- S3 routing-hardening proof:
  - `test/server/formWebhook.test.ts`
  - tests load `config/pms-form-bindings.example.json` and exercise `pms-checkout`, `pms-maintenance-report`, and `pms-housekeeping-done` through registry data.
  - tests cover target shielding, unknown formKey, disabled formKey, unmapped field, fixed-field conflict, schema drift, upstream `schema_validation_failed`, and managed duplicate handling.
- Archived pack docs:
  - `docs/archive/plan/adapter-feishu-pms-smart-intake-v1-2026-04-24_PLAN.md`
  - `docs/archive/plan/adapter-feishu-pms-smart-intake-v1-2026-04-24_STATUS.md`
  - `docs/archive/plan/adapter-feishu-pms-smart-intake-v1-2026-04-24_WORKSET.md`
  - `docs/archive/plan/adapter-feishu-pms-smart-intake-v1-2026-04-24_CLOSEOUT.md`

## Verification

- S3 review probe passed:
  - `3` PMS formKeys found in `config/pms-form-bindings.example.json`
  - strict policies and fixed fields present for each formKey
  - S3 failure anchors present in `test/server/formWebhook.test.ts`
- `npm test -- test/server/formWebhook.test.ts test/docs-boundary.test.ts` passed:
  - `2` test files
  - `23` tests
- `npm run verify` passed:
  - TypeScript build passed
  - `26` test files passed
  - `84` tests passed
- `git diff --check` passed.
- `plan_sync` before archive reported STATUS and WORKSET with `done=3`, `pending=0`.
- Changed-path inspection found no forbidden implementation changes under:
  - `src/core/**`
  - `src/server/httpHost.ts`
  - `src/channels/feishu/bitableClient.ts`
  - `src/providers/pms/**`
  - `src/forms/pms/**`

## Fixes landed

- Added a placeholder-only PMS managed form registry example with exactly the first three PMS smart-intake bindings:
  - `pms-checkout`
  - `pms-maintenance-report`
  - `pms-housekeeping-done`
- Documented the PMS caller contract: callers send only `formKey`, `clientToken`, and `fields`; server-side registry owns `target`, `fieldMap`, `fixedFields`, and strict policy.
- Documented fixed-field action semantics for `CHECK_OUT`, `REPORT_MAINTENANCE`, and `HOUSEKEEPING_DONE` without implementing room-state transitions or workflow execution.
- Added the Feishu Base setup runbook covering required tables, views, role/sensitivity rules, formKey mappings, stable errors, and sandbox readiness.
- Added registry-backed PMS routing tests proving multi-form routing works through existing managed-routing machinery rather than PMS-specific branches in `formWebhook.ts`.

## Successor residuals

- Real Feishu sandbox smoke is intentionally deferred to roadmap Wave 4 or a successor pack.
- Tenant-specific registry files with real `appToken`, `tableId`, and `formId` values remain deployment/operator configuration and must stay outside git.
- Any expansion into PMS workflow execution, room-state transitions, housekeeping task creation, maintenance workflow state, Bitable read/update/search APIs, Bot approval loops, Base provisioning, or MCP runtime requires a new plan pack/replan.
- Production Base schema drift must be managed by operators through the documented setup contract and schema validation feedback.

## Verdict

- `closed`

## Next handoff

- `none`

## Archive note

- On `2026-04-24`, the closed active pack was moved from `docs/plan/` into `docs/archive/plan/` and `docs/plan/README.md` was left as the live no-active-pack placeholder.
