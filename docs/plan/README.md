# Repo Plan Control Plane

## Active Pack

- `docs/plan/ai-pms-core-bootstrap-v1_PLAN.md`
- `docs/plan/ai-pms-core-bootstrap-v1_STATUS.md`
- `docs/plan/ai-pms-core-bootstrap-v1_WORKSET.md`

## Current Active Slice

- `S1`

## Intended Handoff

- `execute-plan`

## Live control-plane state

- active_step: `S1`
- status: `ready_for_execution`
- active_pack: `ai-pms-core-bootstrap-v1`
- latest_closed_pack: `adapter-feishu-pms-smart-intake-v1-2026-04-24`
- latest_closeout: `docs/archive/plan/adapter-feishu-pms-smart-intake-v1-2026-04-24_CLOSEOUT.md`
- latest_completed_step: `S0`

## Active slice summary

`S1` creates the PMS-owned monorepo/workspace skeleton at `/home/peng/dt-git/github/pms-platform`, with `packages/contracts`, `packages/core`, baseline TypeScript/Vitest verification, and a repo-local plan anchor. It must not implement PMS business state-machine logic yet and must not modify `adapter-feishu/src/**`.

## Archived packs

Completed pack artifacts live under `docs/archive/plan/`.

## Notes

- keep `docs/plan/README.md` as the small live control-plane entry
- `docs/plan/*` is the active single-root parser-compatible control plane for the current orchestration pack
- after `/home/peng/dt-git/github/pms-platform` exists, PMS-owned implementation truth should move into `pms-platform/docs/plan/*`
