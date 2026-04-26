# AI PMS Core Bootstrap v1 — WORKSET

> Active execution queue for the PMS Core bootstrap pack.
> Machine mode: single-root parser-compatible under `docs/plan/*`.

## Stage Order

- [x] `S0` baseline-confirmed
- [x] `S1` pms-platform-bootstrap
- [x] `S2` contracts-baseline
- [x] `S3` core-domain-model
- [x] `S4` checkout-dry-run
- [x] `S5` checkout-confirm
- [x] `S6` core-proof-closeout

## Completed Stages

### `S1` — pms-platform-bootstrap

- Owner: `execute-plan`
- State: `DONE`
- Priority: `high`

完成证据：

1. `/home/peng/dt-git/github/pms-platform` exists.
2. Workspace baseline exists with `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, root `README.md`, and `docs/plan/README.md`.
3. `packages/contracts` and `packages/core` exist with `src/index.ts`, `package.json`, and one placeholder test each.
4. `packages/core` imports `@pms-platform/contracts` through the workspace package boundary.
5. `npm install && npm run verify` passed in `/home/peng/dt-git/github/pms-platform` with 2 test files and 2 tests passing.
6. `adapter-feishu/src/**` remained untouched.

### `S2` — contracts-baseline

- Owner: `execute-plan`
- State: `DONE`
- Priority: `high`

完成证据：

1. `packages/contracts/src/index.ts` defines `CommandMeta`, `Actor`, `RoomStatus`, `RoomState`, `HousekeepingTask`, `AuditEntry`, `DomainEvent`, and `DomainError`.
2. It defines `CheckOutCommand`, `CheckOutDryRunPlan`, `RoomCheckedOutEvent`, and `HousekeepingTaskCreatedEvent`.
3. It exports `checkoutContractFixtures` for success and stable failure cases.
4. `validateCommandMeta` proves required metadata validation without implementing command execution.
5. `packages/contracts/test/contracts.test.ts` proves metadata validation and checkout event payload shapes.
6. `packages/core/src/index.ts` consumes contracts through `@pms-platform/contracts` package import.
7. `npm run verify` passed in `/home/peng/dt-git/github/pms-platform` with 2 test files and 4 tests passing.

### `S3` — core-domain-model

- Owner: `execute-plan`
- State: `DONE`
- Priority: `high`

完成证据：

1. `packages/core/src/index.ts` defines `RoomAggregate` with `occupancyStatus`, `cleaningStatus`, `saleStatus`, plus `deriveRoomCode`.
2. It defines checkout-cleaning task creation via `createCheckoutCleaningTask`.
3. It defines replaceable interfaces and in-memory implementations for rooms, housekeeping tasks, audits, idempotency, and domain event collection.
4. It defines domain validation helpers for metadata, room existence, and checkoutable occupancy state.
5. `packages/core/test/core.test.ts` proves room-code derivation, status semantics, contract/aggregate mapping, task creation, domain validation, and repository behavior.
6. `npm run verify` passed in `/home/peng/dt-git/github/pms-platform` with 2 test files and 11 tests passing.

### `S4` — checkout-dry-run

- Owner: `execute-plan`
- State: `DONE`
- Priority: `high`

完成证据：

1. `packages/core/src/index.ts` exports `checkOut`, `CheckOutResult`, and `CoreCheckOutDryRunPlan` for dry-run execution.
2. Dry-run success returns structural room transition, housekeeping-task preview, event preview, reason, correlation id, idempotency key, requestedAt, and actor metadata.
3. `checkoutNextStatusForRoom` plans occupancy `vacant` + cleaning `dirty` while preserving sale status.
4. Tests cover `dueOut` and `occupied` dry-run plans.
5. Tests cover vacant/non-checkoutable room, unknown room, missing reason, missing idempotency key, confirm-mode rejection, and missing execution mode.
6. Tests snapshot room, housekeeping task, audit, idempotency, and event stores and prove dry-run does not mutate them.
7. `npm run verify` passed in `/home/peng/dt-git/github/pms-platform` with 2 test files and 15 tests passing.
8. Guard checks found no `adapter-feishu/src/**` changes and no forbidden Feishu/Hermes/lark/adapter references under `pms-platform/packages`.

### `S5` — checkout-confirm

- Owner: `execute-plan`
- State: `DONE`
- Priority: `high`

完成证据：

1. `checkOut(command)` supports `meta.mode === 'confirm'` in `packages/core/src/index.ts`.
2. Confirmed checkout transitions allowed rooms to `occupancyStatus=vacant`, `cleaningStatus=dirty`, while preserving `saleStatus`.
3. Confirmed checkout creates one checkout-cleaning task, one audit entry, and `RoomCheckedOut` / `HousekeepingTaskCreated` events.
4. Audit and events include actor, correlation id, idempotency key, and command metadata.
5. Duplicate idempotency keys return the stored result without duplicate room mutation, task, audit, or event writes.
6. Tests cover dueOut confirm, occupied confirm, duplicate idempotency, invalid metadata, and invalid room state.
7. `npm run verify` passed in `/home/peng/dt-git/github/pms-platform` with 2 test files and 19 tests passing.
8. Guard checks found no `adapter-feishu/src/**` changes and no forbidden Feishu/Hermes/lark/adapter references under `pms-platform/packages`.

### `S6` — core-proof-closeout

- Owner: `execute-plan`
- State: `DONE`
- Priority: `medium`

完成证据：

1. `packages/core/README.md` documents `CHECK_OUT` metadata, transition matrix, dry-run/confirm behavior, stable errors, audit/events, and idempotency semantics.
2. `docs/checkout-core-v1.md` documents checkout proof status, boundary, transition matrix, test map, verification evidence, and R3 PMS API/MCP successor scope.
3. Root `README.md` now reflects the completed checkout proof rather than placeholder-only bootstrap wording.
4. `npm run verify` passed in `/home/peng/dt-git/github/pms-platform` with 2 test files and 19 tests passing.
5. Guard checks found no `adapter-feishu/src/**` changes and no forbidden Feishu/Hermes/lark/adapter references under `pms-platform/packages`.
6. S6 did not implement API/MCP, Feishu projection, Hermes tools, persistence, or broader PMS workflow.

## Review Handoff

- next_phase: `review`
- next_owner: `execution-reality-audit`
- next_step: `S6`
- expected_after_acceptance: repo-local closeout prompt surface

## Machine Queue

- active_step: `S6`
- latest_completed_step: `S6`
- intended_handoff: `execution-reality-audit`
- latest_closeout_summary: S6 completed: checkout proof is documented for future API/MCP implementers and R3 successor scope is explicit.
- latest_verification:
  - `Added /home/peng/dt-git/github/pms-platform/packages/core/README.md with CHECK_OUT metadata, transition matrix, dry-run/confirm behavior, errors, audit/events, and idempotency notes`
  - `Added /home/peng/dt-git/github/pms-platform/docs/checkout-core-v1.md with proof status, test map, boundary, verification evidence, and R3 PMS API/MCP successor recommendation`
  - `Updated /home/peng/dt-git/github/pms-platform/README.md to reflect the completed checkout proof instead of placeholder-only bootstrap wording`
  - `Ran cd /home/peng/dt-git/github/pms-platform && npm run verify; 2 test files and 19 tests passed`
  - `Guard checks produced no adapter src changes and no Feishu/Hermes/lark/adapter references under pms-platform/packages`
  - `S6 did not implement API/MCP, Feishu projection, Hermes tools, persistence, or broader PMS workflow`
  - `/home/peng/dt-git/github/pms-platform/packages/core/README.md`
  - `/home/peng/dt-git/github/pms-platform/docs/checkout-core-v1.md`
  - `/home/peng/dt-git/github/pms-platform/README.md`
  - `docs/plan/README.md`
  - `docs/plan/ai-pms-core-bootstrap-v1_PLAN.md`
  - `docs/plan/ai-pms-core-bootstrap-v1_STATUS.md`
  - `docs/plan/ai-pms-core-bootstrap-v1_WORKSET.md`