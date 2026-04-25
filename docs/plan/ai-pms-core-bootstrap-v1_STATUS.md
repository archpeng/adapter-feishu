# AI PMS Core Bootstrap v1 — STATUS

> Pack status: active
> Current truth owner: `docs/plan/*`
> Last updated: 2026-04-25

## Current Step

- active_step: `S1`

## Planned Stages

- [x] `S0` baseline-confirmed
- [ ] `S1` pms-platform-bootstrap
- [ ] `S2` contracts-baseline
- [ ] `S3` core-domain-model
- [ ] `S4` checkout-dry-run
- [ ] `S5` checkout-confirm
- [ ] `S6` core-proof-closeout

## Immediate Focus

### `S1`

- Owner: `execute-plan`
- State: `READY`
- Priority: `high`

目标：

- Create the PMS-owned monorepo/workspace skeleton and its own repo-local control plane.

当前事实：

- `adapter-feishu` is already deployed as a Docker baseline and `/health` returns `code: 0`.
- Hermes is installed and configured with Neko API `gpt-5.5`; smoke test returned `neko-auto-ok`.
- Roadmap requires PMS Core to start outside `adapter-feishu`.
- No PMS Core repo has been created yet in this pack.

必须交付：

1. `/home/peng/dt-git/github/pms-platform` exists.
2. Workspace baseline exists with `package.json`, TypeScript config, Vitest config, and package folders for `packages/contracts` and `packages/core`.
3. `pms-platform/docs/plan/README.md` exists and points to the next active pack or explicitly says no active implementation pack after bootstrap.
4. Basic verification command exists, e.g. `npm run verify` or `pnpm verify`, and passes with at least one placeholder test per package.
5. A short `README.md` states PMS Core ownership and explicitly says Feishu/Hermes integration is out of bootstrap scope.

done_when:

1. `pms-platform` can install dependencies and run its baseline verification command successfully.
2. `packages/contracts` and `packages/core` can be imported/compiled without circular dependency.
3. No files under `adapter-feishu/src/**` are modified.
4. The new repo has a clear validation command and a repo-local plan anchor.

stop_boundary:

1. Stop and replan if workspace tooling choice is blocked by missing package manager/runtime.
2. Stop before implementing business state-machine logic beyond placeholder tests.
3. Stop if the work would require changing `adapter-feishu` code to make the PMS repo compile.

## Machine State

- active_step: `S1`
- intended_handoff: `execute-plan`
- active_pack: `ai-pms-core-bootstrap-v1`
- status: `ready_for_execution`
- latest_completed_step: `S0`
- next_step_after_active: `S2`

## Evidence So Far

- `docs/roadmap/ai-pms-service-composition-roadmap.md` defines PMS Core as business truth outside `adapter-feishu`.
- `docs/plan/ai-pms-core-bootstrap-v1_PLAN.md` defines S0-S6 with active S1.
- `adapter-feishu` baseline: Docker container running on port 8787; `/health` returned `code: 0`.
- Hermes baseline: model `gpt-5.5` via Neko API; smoke returned `neko-auto-ok`.

## Open Risks

| Risk | Current control |
|---|---|
| New repo topology drifts from roadmap | S1 requires PMS-owned monorepo and forbids single mono-service. |
| PMS logic leaks into adapter | S1 done_when and stop_boundary forbid `adapter-feishu/src/**` PMS domain edits. |
| Package manager/tooling choice blocks bootstrap | S1 stop_boundary requires replan instead of ad hoc workaround. |
| Overbuilding beyond bootstrap | S1 stops before real state-machine logic. |

## Notes

- This pack lives in `adapter-feishu/docs/plan` because `adapter-feishu` is the current orchestration workspace and Feishu integration anchor.
- After `/home/peng/dt-git/github/pms-platform` exists, successor execution truth should move into `pms-platform/docs/plan/*` for PMS-owned implementation.
