# adapter-feishu PMS Smart Intake v1 2026-04-24 Status

## Current State

- state: `IN_PROGRESS`
- owner: `execute-plan`
- route: `PLAN -> EXEC -> REVIEW -> REPLAN -> CLOSEOUT`
- repo: `/home/peng/dt-git/github/adapter-feishu`
- workstream: `adapter-feishu-pms-smart-intake-v1-2026-04-24`
- roadmap_source: `docs/roadmap/README.md`
- roadmap_scope: `Wave 1`, `Wave 2`, `Wave 3`
- execution_boundary: `PMS smart-intake managed routing, Base schema contract, and test-first routing hardening only`

## Current Step

- active_step: `S1`
- mode: `ready_for_execution`

## Planned Stages

- [ ] `S1` PMS managed form registry and runbook contract
- [ ] `S2` PMS Base schema and view contract
- [ ] `S3` test-first PMS managed routing hardening

## Immediate Focus

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

## Machine State

- active_step: `S1`
- latest_completed_step: `none`
- intended_handoff: `execute-plan`
- terminal: `false`

## Recently Completed

- Roadmap source created at `docs/roadmap/README.md`.
- Roadmap Wave 1-3 selected as the initial low-risk execution scope.
- Pre-plan `plan_sync` reported no active pack in `docs/plan`.

## Next Step

- `S1`

## Blockers

- No implementation blocker for S1.
- Real Feishu sandbox smoke is out of scope until after S1-S3; do not block this pack on live credentials.

## Gate State

- roadmap_wave_1_planned: `true`
- roadmap_wave_2_planned: `true`
- roadmap_wave_3_planned: `true`
- pms_registry_example: `pending`
- pms_base_schema_contract: `pending`
- pms_managed_routing_tests: `pending`
- application_code_changes_allowed: `limited-to-existing-managed-routing-hardening`

## Latest Evidence

- `docs/roadmap/README.md` defines Wave 1-3 and explicitly recommends creating this active plan pack before implementation.
- Current root branch before plan creation was `main` with only roadmap docs changed.

## Notes

- This status file is writeback-friendly parser truth for the active pack.
- Active stage ID `S1` is the `stepId` for routed active-slice reports under extension autopilot.
- Review routes to `execution-reality-audit`; closeout uses the repo-local closeout prompt surface.
