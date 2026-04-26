# AI PMS Core Bootstrap v1 — PLAN

> Pack status: active
> Roadmap source: `docs/roadmap/ai-pms-service-composition-roadmap.md`
> Pack scope: turn the roadmap's R1/R2 PMS Core plan into executable, proof-carrying slices.
> Machine mode: single-root parser-compatible plan pack under `docs/plan/*`.

## Overall Goal

Create the first PMS-owned codebase and prove the first PMS Core business slice without moving PMS domain logic into `adapter-feishu` or Hermes.

Target end state for this pack:

```text
pms-platform/
  packages/contracts/  # shared command/event/domain contracts
  packages/core/       # PMS business kernel with CHECK_OUT slice
  docs/plan/           # repo-local execution control plane for successor work
```

The pack is complete when PMS Core can run and test a local `CHECK_OUT` command with dry-run, confirm, idempotency, audit, and emitted domain events, with no dependency on Feishu, Hermes, or `adapter-feishu` internals.

## Source-of-truth Constraints

- `adapter-feishu` remains a standalone Feishu/Lark channel adapter.
- PMS domain logic must not be added under `adapter-feishu/src/**`.
- Hermes remains an AI operator/runtime and must not own PMS facts.
- PMS Core must be independently testable without Feishu or Hermes.
- All mutating PMS commands require `actor`, `source`, `reason`, `idempotencyKey`, `correlationId`, `dryRun`/`confirm`, and `requestedAt` semantics.
- The first vertical slice is `CHECK_OUT` because it proves room state, housekeeping, audit, idempotency, and event emission without payment/OTA/door-lock scope.

## Non-goals

- No Feishu Base projection implementation in this pack.
- No Hermes MCP integration in this pack.
- No `adapter-feishu` API expansion in this pack unless documentation needs a boundary pointer.
- No check-in, room-change, extend-stay, payment, OTA, door-lock, invoice, public-security, or night-audit workflow.
- No production deployment of PMS Core yet.

## Deliverables

1. A new PMS-owned workspace/repo at `/home/peng/dt-git/github/pms-platform` or a documented blocker if creation is impossible.
2. TypeScript workspace baseline with contracts/core packages and tests.
3. Contracts for PMS command metadata, room status, checkout command, checkout dry-run result, audit entry, idempotency record, and domain events.
4. PMS Core in-memory implementation for `CHECK_OUT` dry-run and confirm.
5. Unit tests covering state transitions, validation, idempotency, audit, and event emission.
6. A successor handoff plan for R3 PMS API/MCP after core proof is complete.

## Slice Plan

#### `S0` — baseline-confirmed

- Owner: `plan-creator`
- State: `DONE`
- Priority: `high`

目标：

- Confirm external baselines are stable enough to start PMS Core work.

交付物：

1. `adapter-feishu` running as Docker container with `/health` returning `code: 0`.
2. Hermes installed and configured with Neko API `gpt-5.5` smoke test passing.
3. Roadmap decision that PMS Core starts outside `adapter-feishu`.

已知证据：

- `adapter-feishu` health returned `{"code":0,"status":"ok","ingressMode":"long_connection","providers":["warning-agent"]}`.
- Hermes smoke returned `neko-auto-ok` using Neko API `gpt-5.5`.
- `docs/roadmap/ai-pms-service-composition-roadmap.md` contains PMS monorepo + independent adapter decision.

done_when:

1. Baseline facts are recorded in this plan pack.
2. No source-code changes are required in `adapter-feishu` before PMS Core bootstrap.

stop_boundary:

1. If either external baseline becomes unavailable during later slices, record it as a blocker but do not move PMS logic into `adapter-feishu`.

必须避免：

1. Treating Hermes or `adapter-feishu` as PMS Core because they are already running.

#### `S1` — pms-platform-bootstrap

- Owner: `execute-plan`
- State: `DONE`
- Priority: `high`

目标：

- Create the PMS-owned monorepo/workspace skeleton and its own repo-local control plane.

交付物：

1. `/home/peng/dt-git/github/pms-platform` exists.
2. Workspace baseline exists with `package.json`, TypeScript config, Vitest config, and package folders for `packages/contracts` and `packages/core`.
3. `pms-platform/docs/plan/README.md` exists and points to the next active pack or explicitly says no active implementation pack after bootstrap.
4. Basic verification command exists, e.g. `npm run verify` or `pnpm verify`, and passes with at least one placeholder test per package.
5. A short `README.md` states PMS Core ownership and explicitly says Feishu/Hermes integration is out of the bootstrap scope.

done_when:

1. `pms-platform` can install dependencies and run its baseline verification command successfully.
2. `packages/contracts` and `packages/core` can be imported/compiled without circular dependency.
3. No files under `adapter-feishu/src/**` are modified.
4. The new repo has a clear validation command and a repo-local plan anchor.

stop_boundary:

1. Stop and replan if workspace tooling choice is blocked by missing package manager/runtime.
2. Stop before implementing business state-machine logic beyond placeholder tests.
3. Stop if the work would require changing `adapter-feishu` code to make the PMS repo compile.

必须避免：

1. Creating a mono-service that combines Hermes, PMS Core, and `adapter-feishu`.
2. Adding PMS domain code to `adapter-feishu`.
3. Adding Feishu SDK or Hermes dependencies to `packages/core`.

#### `S2` — contracts-baseline

- Owner: `execute-plan`
- State: `DONE`
- Priority: `high`

目标：

- Define stable PMS command/event contracts before domain implementation.

交付物：

1. `CommandMeta` with `actor`, `source`, `reason`, `idempotencyKey`, `correlationId`, `requestedAt`, and execution mode fields.
2. `Actor`, `RoomStatus`, `RoomState`, `HousekeepingTask`, `AuditEntry`, `DomainEvent`, and `DomainError` types.
3. `CheckOutCommand`, `CheckOutDryRunPlan`, `RoomCheckedOutEvent`, and `HousekeepingTaskCreatedEvent` contracts.
4. Contract examples/fixtures for success and stable failure cases.
5. Tests proving required metadata validation and event payload shapes.

done_when:

1. Contract tests pass.
2. `packages/core` consumes contracts via package import, not duplicated local types.
3. Required cross-cutting fields from roadmap R1 exist in contract form.
4. Contracts include no Feishu SDK, Hermes prompt, or adapter-specific types.

stop_boundary:

1. Stop if contract changes require deciding full reservation/payment/OTA schema.
2. Stop if a field is only needed by Feishu presentation rather than PMS business truth.
3. Stop before implementing command execution beyond validation helpers.

必须避免：

1. Hiding required write-command metadata as optional convenience fields.
2. Encoding Feishu field names as canonical PMS Core fields.

#### `S3` — core-domain-model

- Owner: `execute-plan`
- State: `DONE`
- Priority: `high`

目标：

- Build the minimal PMS Core domain model and in-memory ports needed for checkout.

交付物：

1. Room aggregate/model with `occupancyStatus`, `cleaningStatus`, `saleStatus`, and derived room-code helper.
2. Housekeeping task model for checkout-cleaning creation.
3. In-memory repositories/ports for rooms, housekeeping tasks, audits, idempotency, and event collection.
4. Domain validation helpers for mandatory `reason`, valid room state, and execution mode.
5. Unit tests for room-code derivation and repository behavior.

done_when:

1. Domain tests pass without HTTP, DB, Feishu, or Hermes.
2. Room status model supports at least `occupied`, `dueOut`, `vacant`, `clean`, `dirty`, `sellable`, `outOfOrder`, and `outOfService` semantics needed by checkout.
3. In-memory ports are replaceable by future Postgres implementation.

stop_boundary:

1. Stop before adding persistence migrations or Postgres if the in-memory core is not proven.
2. Stop before adding unrelated reservation/check-in/change-room complexity.

必须避免：

1. Treating Feishu Base rows as the canonical domain model.
2. Embedding adapter or UI concerns in domain entities.

#### `S4` — checkout-dry-run

- Owner: `execute-plan`
- State: `DONE`
- Priority: `high`

目标：

- Implement `checkOut` dry-run planning without mutating state.

交付物：

1. `checkOut(command)` execution path for `dryRun=true`.
2. Dry-run plan describing room status transition and housekeeping task that would be created.
3. Stable errors for missing reason, missing idempotency key, unknown room, invalid current state, and missing dry-run/confirm intent.
4. Tests proving dry-run does not mutate room, tasks, audit, or idempotency state.

done_when:

1. Dry-run tests pass for `occupied` and `dueOut` rooms.
2. Dry-run invalid-state tests pass for already vacant/non-checkoutable rooms.
3. No audit entry or housekeeping task is created during dry-run.
4. Returned plan contains enough information for Hermes to explain the intended change later.

stop_boundary:

1. Stop before confirm execution if dry-run semantics or error shape is unstable.
2. Stop before adding Hermes/MCP explanation code.

必须避免：

1. Mutating state during dry-run.
2. Returning prose-only plans that cannot be tested structurally.

完成证据：

1. `checkOut` dry-run returns structural plans/errors from `packages/core/src/index.ts`.
2. Tests cover `occupied`, `dueOut`, vacant/non-checkoutable, unknown room, missing reason, missing idempotency key, confirm-mode rejection, missing mode, and no-mutation snapshots.
3. `npm run verify` passed in `/home/peng/dt-git/github/pms-platform` with 2 test files and 15 tests passing.

#### `S5` — checkout-confirm

- Owner: `execute-plan`
- State: `DONE`
- Priority: `high`

目标：

- Implement confirmed checkout execution with idempotency, audit, and events.

交付物：

1. `checkOut(command)` execution path for `confirm=true`.
2. Room transition to `occupancyStatus=vacant`, `cleaningStatus=dirty`, and unchanged sale status unless future policy says otherwise.
3. Housekeeping checkout-cleaning task creation.
4. Audit log entry with actor/source/reason/correlation/idempotency metadata.
5. Domain events `RoomCheckedOut` and `HousekeepingTaskCreated`.
6. Idempotency behavior that prevents duplicate task creation for repeated command key.


done_when:

1. Confirm tests pass for allowed room states.
2. Duplicate `idempotencyKey` test proves no duplicate task or double mutation.
3. Audit and event tests assert correlation and actor metadata.
4. Invalid confirm without required metadata fails with stable error.

stop_boundary:

1. Stop before adding external side effects such as Feishu notification or DB outbox.
2. Stop if idempotency semantics are ambiguous and require a human decision.

必须避免：

1. Calling `adapter-feishu` from PMS Core.
2. Letting confirmed checkout bypass audit or idempotency.

完成证据：

1. Confirmed checkout transitions room state, creates housekeeping task, audit, and domain events.
2. Duplicate `idempotencyKey` returns the prior result without duplicate side effects.
3. `npm run verify` passed in `/home/peng/dt-git/github/pms-platform` with 2 test files and 19 tests passing.

#### `S6` — core-proof-closeout

- Owner: `execute-plan`
- State: `DONE`
- Priority: `medium`

目标：

- Harden the PMS Core checkout slice and prepare the R3 PMS API/MCP successor plan.

交付物：

1. Complete test matrix documentation for checkout state transitions.
2. `packages/core` README or docs explaining command behavior, errors, and events.
3. Verification evidence from `pms-platform` baseline command.
4. Successor plan recommendation for PMS API/MCP tool exposure.
5. Optional closeout note copied or referenced from `adapter-feishu/docs/plan` if this orchestration pack needs to be closed.

done_when:

1. All PMS Core tests pass.
2. The checkout command can be understood by a future API/MCP implementer from docs and tests.
3. R3 successor scope is explicit and does not include Feishu projection yet unless checkout core is stable.

stop_boundary:

1. Stop before implementing API/MCP in the same slice.
2. Stop before configuring Hermes tools until PMS Core contracts and behavior are stable.

必须避免：

1. Expanding into full PMS workflow before the first checkout proof is closed.

完成证据：

1. Added `packages/core/README.md` documenting `CHECK_OUT` behavior, transition matrix, metadata, errors, events, audit, and idempotency.
2. Added `docs/checkout-core-v1.md` documenting checkout proof status, test map, verification evidence, and R3 PMS API/MCP successor scope.
3. Updated `/home/peng/dt-git/github/pms-platform/README.md` from bootstrap placeholder wording to current checkout proof wording.
4. `npm run verify` passed in `/home/peng/dt-git/github/pms-platform` with 2 test files and 19 tests passing.
5. Guard checks found no `adapter-feishu/src/**` changes and no forbidden Feishu/Hermes/lark/adapter references under `pms-platform/packages`.

## Verification Ladder

1. `adapter-feishu`: keep `npm run verify` passing whenever this repo is touched.
2. `pms-platform` bootstrap: package install + typecheck/test baseline.
3. Contracts: schema/type tests and fixtures.
4. Core: unit tests for state transitions, idempotency, audit, and events.
5. Closeout: proof that no PMS domain logic was added to `adapter-feishu`.

## Handoff Policy

- Active slice handoff: `execution-reality-audit` for S6 review, then repo-local closeout prompt surface if accepted.
- Replan if repo topology, package manager, or command metadata requirements become contested.
- Review after each implementation slice should use evidence from tests and file diffs.
- Do not proceed to Hermes MCP integration until S5/S6 proves PMS Core behavior.
