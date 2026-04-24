# Repo Plan Control Plane

## Active Pack

- `docs/plan/adapter-feishu-pms-smart-intake-v1-2026-04-24_PLAN.md`
- `docs/plan/adapter-feishu-pms-smart-intake-v1-2026-04-24_STATUS.md`
- `docs/plan/adapter-feishu-pms-smart-intake-v1-2026-04-24_WORKSET.md`

## Current Active Slice

- `S1`

## Intended Handoff

- `execute-plan`

## Live control-plane state

- active_step: `S1`
- status: `active`
- active_pack: `adapter-feishu-pms-smart-intake-v1-2026-04-24`
- roadmap_source: `docs/roadmap/README.md`
- roadmap_waves_in_scope: `Wave 1`, `Wave 2`, `Wave 3`
- latest_closed_pack: `adapter-feishu-managed-form-routing-v1-2026-04-24`
- latest_closeout: `docs/archive/plan/adapter-feishu-managed-form-routing-v1-2026-04-24_CLOSEOUT.md`

## Archived packs

Completed pack artifacts live under `docs/archive/plan/`.

## Notes

- keep `docs/plan/README.md` as the small live control-plane entry
- this active pack converts the PMS roadmap Wave 1-3 scope into a parser-compatible execution queue
- do not broaden this pack into PMS workflow execution, Bitable read/update seams, Bot approval loops, or MCP runtime work
- close or supersede this pack before starting roadmap Wave 4+ implementation
