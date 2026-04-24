# adapter-feishu PMS Smart Intake v1 2026-04-24 Plan

- plan_id: `adapter-feishu-pms-smart-intake-v1-2026-04-24`
- plan_class: `execution-plan`
- status: `active`
- mode: `single-root-autopilot-compatible`
- roadmap_source: `docs/roadmap/README.md`
- roadmap_scope: `Wave 1`, `Wave 2`, `Wave 3`
- predecessor_pack: `adapter-feishu-managed-form-routing-v1-2026-04-24` (closed and archived)
- last_updated: `2026-04-24`

## Goal

Create the first executable PMS smart-intake foundation for `adapter-feishu` by converting roadmap Wave 1-3 into bounded implementation slices:

1. define PMS `formKey` managed-routing examples over the existing `/providers/form-webhook` path;
2. document the Feishu Base/table/form/view contract for the light hotel PMS intake path;
3. add test-first hardening that proves PMS managed routing remains a registry-driven record-write surface and does not become a PMS monolith.

## Scope

In scope:

- `config/pms-form-bindings.example.json` or equivalent placeholder-only PMS registry example.
- `docs/runbook/adapter-feishu-form-integration.md` updates for PMS smart-intake usage.
- `docs/roadmap/pms-base-schema.md` or `docs/runbook/adapter-feishu-pms-base-setup.md` with Base schema, view, permission, and mapping contract.
- Focused tests around managed form routing and docs boundary truth:
  - `test/server/formWebhook.test.ts`
  - `test/runtime.test.ts`
  - `test/config.test.ts`
  - `test/docs-boundary.test.ts`
- Existing config/runtime/form webhook surfaces only as needed to load and validate placeholder examples.

Out of scope for this pack:

- Bitable read/update/search workflow execution.
- PMS room-state transitions inside adapter core.
- Bot approval/notification workflow implementation.
- External Codex/MCP wrapper implementation.
- Any real Feishu tenant IDs, app secrets, appToken/tableId/formId values.

## Non-Goals

- Do not change the frozen product boundary: `adapter-feishu` remains a standalone Feishu/Lark channel service.
- Do not turn `src/server/formWebhook.ts` into a hotel PMS state machine.
- Do not create Base/table/form resources from this repo.
- Do not add generic arbitrary-table write tools.
- Do not implement roadmap Wave 4+ inside this pack.
- Do not edit unrelated `warning-agent` provider behavior.

## Deliverables

1. PMS managed form routing example with multiple `formKey` bindings and placeholder-only targets.
2. PMS Base schema/view/setup contract covering the first smart-intake tables, fields, views, and formKey-to-field mappings.
3. Tests that prove multi-form PMS managed routing uses registry mapping, fixed fields, target shielding, schema validation, and stable errors.
4. Updated runbook/docs explaining how to run `CHECK_OUT`, `REPORT_MAINTENANCE`, and `HOUSEKEEPING_DONE` as smart-intake writes.
5. Parser-compatible `docs/plan/README.md`, `PLAN`, `STATUS`, and `WORKSET` with active slice `S1`.

## Constraints

- `docs/plan/*` is the single repo-local machine truth for this workstream.
- Active-slice reports should use `stepId` equal to the active slice ID when running under extension autopilot.
- Default continuation is automatic; use `done_when` / `stop_boundary` instead of “ask whether to continue”.
- Review routes to `execution-reality-audit`; closeout uses the repo-local closeout prompt surface.
- Any PMS registry example must be placeholder-only and safe to commit.
- Any new env/config docs must keep target selection server-side; managed mode must not rely on caller-supplied raw `target`.
- `npm run verify` is the final gate before closeout.

## Verification

Minimum ladder by slice:

1. S1: JSON/example docs validation plus targeted docs/runtime/config tests if touched.
2. S2: documentation/readback validation that every required PMS table/view/formKey mapping is specified without real tenant IDs.
3. S3: targeted managed-routing tests plus `npm run verify`.

Pack-level final verification:

```bash
npm run verify
git diff --check
```

Optional sandbox proof after this pack, not required for S1-S3 closeout:

```text
POST /providers/form-webhook with formKey pms-checkout / pms-maintenance-report / pms-housekeeping-done against a real sandbox Base.
```

## Blockers / Risks

- Real Feishu Base/table/form IDs are not available in the repo and must not be committed.
- Schema validation needs existing forms and fields; local tests must use stubs, not live tenant dependencies.
- Roadmap Wave 4+ may tempt workflow expansion; this pack must stop before Bitable read/update workflow execution.
- If managed routing cannot express PMS formKey differences without production code changes, stop and replan before widening `formWebhook.ts`.

## Slice Definitions

#### `S1` — PMS managed form registry and runbook contract

- Owner: `execute-plan`
- State: `READY`
- Priority: `highest`

目标：

- Establish the PMS smart-intake `formKey` contract on top of existing managed form routing, without changing adapter core behavior.

交付物：

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

#### `S2` — PMS Base schema and view contract

- Owner: `execute-plan`
- State: `queued`
- Priority: `high`

目标：

- Convert the PRD data model into an executable Feishu Base setup contract that operators can build before sandbox/live smoke.

交付物：

1. `docs/roadmap/pms-base-schema.md` or `docs/runbook/adapter-feishu-pms-base-setup.md` with table schemas for room ledger, PMS operation requests, housekeeping tasks, maintenance tickets, reservations, operation logs, and inventory calendar.
2. View contract for frontdesk room wall, today arrivals/departures, sellable rooms, dirty rooms, inspection queue, cleaning-in-progress, maintenance stop-sell, and exceptions.
3. Permission/sensitivity notes for guest data, operator identity, reason fields, payload/result JSON, and role-based views.
4. Mapping table from PMS `formKey` to target table, action, required fields, optional fields, and stable error expectations.

验证：

1. Documentation contains no real Feishu tenant IDs or credentials.
2. Every formKey introduced in S1 has a documented target table and field mapping.
3. Docs clearly state that adapter-feishu does not create Base/table/form resources.

done_when:

1. PMS Base schema doc exists and covers all required tables from roadmap Wave 2.
2. Required frontdesk and operations views are listed with purpose and minimal visible fields.
3. The doc provides enough information for a human operator to create a sandbox Base without reading the original PRD.

stop_boundary:

1. Stop before writing code that creates or patches Feishu Base resources.
2. Stop if schema decisions require product clarification beyond light PMS smart intake.
3. Stop before adding payment, invoice, police upload, door-lock, OTA, member, or night-audit modules.

必须避免：

1. Mixing full commercial PMS scope into the Base schema.
2. Storing full sensitive guest documents or complete payment data in the proposed Base schema.
3. Making the adapter responsible for Base provisioning.

#### `S3` — test-first PMS managed routing hardening

- Owner: `execute-plan`
- State: `queued`
- Priority: `high`

目标：

- Lock PMS smart-intake routing with tests before any future workflow expansion, proving the current adapter remains a bounded record-write ingress.

交付物：

1. Tests for at least three PMS formKeys exercising successful mapping and fixed-field injection.
2. Tests for target shielding, unknown formKey, disabled formKey, unmapped business fields, fixed-field conflict, schema validation drift, and duplicate handling where applicable.
3. Docs boundary tests asserting PMS docs/examples preserve adapter boundaries and placeholder-only target values.
4. Final `npm run verify` evidence.

验证：

1. `npm test -- test/server/formWebhook.test.ts test/docs-boundary.test.ts` passes.
2. `npm run verify` passes.
3. `git diff --check` passes.

done_when:

1. PMS managed routing tests prove multi-form routing works through registry data rather than new `formWebhook.ts` PMS branches.
2. Failure modes return stable managed-routing errors already documented for operators.
3. Full repo verification passes after S1-S3 changes.

stop_boundary:

1. Stop before adding PMS workflow code, Bitable read/update APIs, or Bot approval loops.
2. Stop and replan if tests require changing endpoint semantics beyond managed routing hardening.
3. Stop if live Feishu credentials are needed to prove behavior; use stubs for this pack and defer live smoke to Wave 4.

必须避免：

1. Treating S3 tests as permission to implement roadmap Wave 4+ in the same pack.
2. Hiding schema drift or target override behavior behind broad error assertions.
3. Weakening auth, target shielding, fixed-field conflict, or unmapped-field validation.

## Exit Criteria

- S1-S3 are complete and reviewed.
- `docs/plan/README.md`, `STATUS`, and `WORKSET` have accurate terminal or next-slice truth.
- The repo still presents `adapter-feishu` as a standalone Feishu/Lark channel service.
- `npm run verify` and `git diff --check` pass.
- If the workstream reaches terminal completion, closeout uses the repo-local closeout prompt surface and archives or updates the active pack according to repo convention.
