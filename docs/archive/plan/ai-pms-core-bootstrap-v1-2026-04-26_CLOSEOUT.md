# AI PMS Core Bootstrap v1 closeout

## Findings

- The bounded `ai-pms-core-bootstrap-v1` pack is fully landed, reality-audited, and closed at repo scope.
- PMS-owned code was created and developed in `/home/peng/dt-git/github/pms-platform`, not inside `adapter-feishu`.
- `adapter-feishu` remained an independent Feishu/Lark channel adapter; no PMS domain/state-machine logic was added under `adapter-feishu/src/**`.
- The first PMS Core `CHECK_OUT` proof now covers contracts, dry-run, confirm execution, idempotency, audit, events, housekeeping task creation, and successor handoff documentation.
- The pack intentionally stopped before HTTP/API/MCP implementation, Feishu projection/notification, Hermes tool configuration, Postgres persistence, durable outbox, and broader PMS workflow expansion.

## Evidence added

- Roadmap / orchestration:
  - `docs/roadmap/ai-pms-service-composition-roadmap.md`
  - `docs/roadmap/README.md`
- Archived active pack docs:
  - `docs/archive/plan/ai-pms-core-bootstrap-v1-2026-04-26_PLAN.md`
  - `docs/archive/plan/ai-pms-core-bootstrap-v1-2026-04-26_STATUS.md`
  - `docs/archive/plan/ai-pms-core-bootstrap-v1-2026-04-26_WORKSET.md`
  - `docs/archive/plan/ai-pms-core-bootstrap-v1-2026-04-26_CLOSEOUT.md`
- PMS platform workspace:
  - `/home/peng/dt-git/github/pms-platform/package.json`
  - `/home/peng/dt-git/github/pms-platform/tsconfig.json`
  - `/home/peng/dt-git/github/pms-platform/vitest.config.ts`
  - `/home/peng/dt-git/github/pms-platform/README.md`
  - `/home/peng/dt-git/github/pms-platform/docs/plan/README.md`
- PMS contracts:
  - `/home/peng/dt-git/github/pms-platform/packages/contracts/src/index.ts`
  - `/home/peng/dt-git/github/pms-platform/packages/contracts/test/contracts.test.ts`
- PMS Core:
  - `/home/peng/dt-git/github/pms-platform/packages/core/src/index.ts`
  - `/home/peng/dt-git/github/pms-platform/packages/core/test/core.test.ts`
  - `/home/peng/dt-git/github/pms-platform/packages/core/README.md`
  - `/home/peng/dt-git/github/pms-platform/docs/checkout-core-v1.md`

## Verification

- PMS platform final verification passed:
  - `cd /home/peng/dt-git/github/pms-platform && npm run verify`
  - `2` test files passed
  - `19` tests passed
- Final S6 review verification passed with the same baseline command.
- Final guard checks passed:
  - `cd /home/peng/dt-git/github/adapter-feishu && git status --short src` produced no output.
  - `cd /home/peng/dt-git/github/pms-platform && rg -n "Feishu|Hermes|lark|adapter" packages || true` produced no output.
- `plan_sync` before archive reported `STATUS` and `WORKSET` with `done=7`, `pending=0`.

## Fixes landed

- Created PMS-owned `pms-platform` npm workspace with `packages/contracts` and `packages/core`.
- Implemented PMS command/event/domain contracts for the first `CHECK_OUT` command.
- Implemented core room aggregate/status mapping, checkout-cleaning task creation, validation helpers, replaceable repositories/ports, and in-memory adapters for proof.
- Implemented `checkOut` dry-run planning with structural result/error payloads and no-mutation proof.
- Implemented confirmed checkout execution:
  - checkoutable `occupied` / `dueOut` rooms transition to `occupancyStatus=vacant` and `cleaningStatus=dirty`;
  - sale status is preserved;
  - one checkout-cleaning housekeeping task is created;
  - one audit entry is appended;
  - `RoomCheckedOut` and `HousekeepingTaskCreated` events are emitted;
  - repeated `idempotencyKey` returns the stored prior result without duplicate room/task/audit/event writes.
- Documented checkout behavior for future API/MCP implementers:
  - command metadata;
  - transition matrix;
  - dry-run and confirm behavior;
  - stable errors;
  - audit/event/idempotency semantics;
  - R3 successor scope.

## Successor residuals

- `pms-platform` currently has no remote configured and remains uncommitted in the local workspace.
- Future R3 API/MCP exposure should create a new PMS-owned plan pack, preferably under `/home/peng/dt-git/github/pms-platform/docs/plan/*` rather than continuing this adapter-hosted bootstrap pack.
- R3 should expose `CHECK_OUT` through API/MCP without duplicating PMS Core business rules.
- R3 should add request-fingerprint semantics for idempotency before durable persistence or distributed API/MCP exposure.
- Feishu projection/notification, Hermes tool configuration, durable outbox, worker dispatch, and broader PMS workflows remain explicitly out of scope until a successor pack accepts them.
- `adapter-feishu` remains a channel adapter and should not become PMS Core.

## Verdict

- `closed`

## Next handoff

- `plan-creator` for a successor PMS-owned R3 API/MCP plan pack, preferably rooted in `/home/peng/dt-git/github/pms-platform/docs/plan/*`.

## Archive note

- On `2026-04-26`, the closed active pack was moved from `docs/plan/` into `docs/archive/plan/` and `docs/plan/README.md` was left as the live no-active-pack placeholder.
