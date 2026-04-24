# adapter-feishu managed form routing v1 closeout

## Findings

- The bounded managed multi-form routing v1 goal is fully landed, reality-audited, and closed at repo scope.
- `POST /providers/form-webhook` now supports the preferred managed handoff:
  - caller sends `formKey + fields`
  - adapter resolves a server-side registry binding from `ADAPTER_FEISHU_FORM_REGISTRY_PATH`
  - business field keys map through `fieldMap`
  - `fixedFields` are injected and protected from caller override
  - managed mode rejects caller-supplied raw `target`
  - optional/default schema preflight, dedupe, same-table serialization, and Feishu record creation reuse the existing form-webhook path
- Legacy no-`formKey` requests remain compatible with the default-target / bounded override path.
- The repo boundary remains honest:
  - existing Feishu Base/table/form integration only
  - no Base/table/form create/patch/publish workflow
  - no full smart-form control plane
  - no value-transform DSL, field auto-create, attachment upload, or live admin UI

## Evidence added

- implementation surfaces:
  - `src/config.ts`
  - `src/forms/registry.ts`
  - `src/runtime.ts`
  - `src/server/formWebhook.ts`
  - `config/form-bindings.example.json`
  - `.env.example`
- proof surfaces:
  - `test/config.test.ts`
  - `test/runtime.test.ts`
  - `test/server/formWebhook.test.ts`
  - `test/docs-boundary.test.ts`
- operator/reviewer handoff:
  - `README.md`
  - `docs/runbook/adapter-feishu-form-integration.md`
  - archived pack docs in `docs/archive/plan/adapter-feishu-managed-form-routing-v1-2026-04-24_*`
- live managed proof:
  - used an untracked tenant-specific registry file outside repo history
  - request shape contained `formKey`, `clientToken`, and `fields` only; no raw `target` was sent
  - current-code runtime returned HTTP `200`, `status: record_created`, `recordId: recvhHryamOica`, and `targetSource: managed`
  - target values were redacted from tracked evidence
- latest verification truth:
  - `npm run build` -> passed during live proof execution
  - `npm test -- test/docs-boundary.test.ts` -> passed during closeout
  - `npm run verify` -> passed, `26` files / `80` tests
  - `git diff --check` -> passed

## Fixes landed

- added managed form registry path parsing and startup fail-fast registry load
- added managed registry contract validation for `version`, `forms`, enabled bindings, target, `fieldMap`, `fixedFields`, and policy booleans
- added managed routing inside the existing `/providers/form-webhook` endpoint instead of a second endpoint
- added stable managed errors for missing/unloaded registry, unknown/disabled `formKey`, target override attempts, unmapped fields, fixed-field conflicts, and schema drift
- updated operator docs to lead with managed `formKey` mode and frame raw target override as a legacy escape hatch
- archived the active pack docs and restored `docs/plan/README.md` to the no-active-pack placeholder
- updated live README plan-state text so it no longer points operators at a completed active pack

## Successor residuals

- tenant-specific registry files remain deployment/operator configuration and must stay untracked or mounted; do not commit real Feishu target IDs or app secrets
- each real form/table still needs an operator-maintained `fieldMap` aligned with the real Feishu schema
- future expansion into value transforms, option lookup, attachment handling, dynamic admin UI, form create/patch, or broader control-plane behavior requires a new successor plan pack
- same-table serialization remains intentionally in-process only, matching the predecessor form-webhook scope

## Verdict

- `closed`

## Next handoff

- `none`

## Archive note

- on `2026-04-24`, the closed active pack was moved from `docs/plan/` into `docs/archive/plan/` and `docs/plan/README.md` was left as the live no-active-pack placeholder.
