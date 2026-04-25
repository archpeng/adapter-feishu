# AI PMS Core Bootstrap v1 — WORKSET

> Active execution queue for the PMS Core bootstrap pack.
> Machine mode: single-root parser-compatible under `docs/plan/*`.

## Stage Order

- [x] `S0` baseline-confirmed
- [ ] `S1` pms-platform-bootstrap
- [ ] `S2` contracts-baseline
- [ ] `S3` core-domain-model
- [ ] `S4` checkout-dry-run
- [ ] `S5` checkout-confirm
- [ ] `S6` core-proof-closeout

## Active Stage

### `S1`

- Owner: `execute-plan`
- State: `READY`
- Priority: `high`

目标：

- Create the PMS-owned monorepo/workspace skeleton and its own repo-local control plane.

执行边界：

- Work may create `/home/peng/dt-git/github/pms-platform`.
- Work may add files under the new `pms-platform` repo/workspace.
- Work may update `adapter-feishu/docs/plan/*` status only to record completion or blockers.
- Work must not add PMS domain code to `adapter-feishu/src/**`.

必须交付：

1. `/home/peng/dt-git/github/pms-platform` exists.
2. Workspace baseline exists with `package.json`, TypeScript config, Vitest config, and package folders for `packages/contracts` and `packages/core`.
3. `pms-platform/docs/plan/README.md` exists and points to the next active pack or explicitly says no active implementation pack after bootstrap.
4. Basic verification command exists, e.g. `npm run verify` or `pnpm verify`, and passes with at least one placeholder test per package.
5. A short `README.md` states PMS Core ownership and explicitly says Feishu/Hermes integration is out of bootstrap scope.

建议文件/目录：

```text
/home/peng/dt-git/github/pms-platform/
  README.md
  package.json
  tsconfig.json
  vitest.config.ts
  docs/plan/README.md
  packages/contracts/package.json
  packages/contracts/src/index.ts
  packages/contracts/test/contracts.test.ts
  packages/core/package.json
  packages/core/src/index.ts
  packages/core/test/core.test.ts
```

建议验证：

```bash
cd /home/peng/dt-git/github/pms-platform
npm install
npm run verify
```

If using `pnpm`, the equivalent is acceptable only if the repo declares it explicitly and the command is reproducible.

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
4. Starting `CHECK_OUT` implementation before the workspace baseline and plan anchor are valid.

## Queued Stages

### `S2` — contracts-baseline

- Owner: `execute-plan`
- State: `QUEUED`
- Priority: `high`

目标：

- Define stable PMS command/event contracts before domain implementation.

必须交付：

1. `CommandMeta`, `Actor`, `RoomStatus`, `RoomState`, `HousekeepingTask`, `AuditEntry`, `DomainEvent`, `DomainError`.
2. `CheckOutCommand`, `CheckOutDryRunPlan`, `RoomCheckedOutEvent`, `HousekeepingTaskCreatedEvent`.
3. Contract examples/fixtures for success and stable failure cases.
4. Tests for required metadata and event payload shapes.

done_when:

1. Contract tests pass.
2. `packages/core` consumes contracts via package import.
3. Cross-cutting fields from roadmap R1 exist in contract form.
4. Contracts include no Feishu SDK, Hermes prompt, or adapter-specific types.

stop_boundary:

1. Stop before full reservation/payment/OTA schema decisions.
2. Stop before command execution beyond validation helpers.

### `S3` — core-domain-model

- Owner: `execute-plan`
- State: `QUEUED`
- Priority: `high`

目标：

- Build the minimal PMS Core domain model and in-memory ports needed for checkout.

必须交付：

1. Room aggregate/model with status fields and derived room-code helper.
2. Housekeeping task model.
3. In-memory repositories/ports for rooms, tasks, audits, idempotency, and events.
4. Domain validation helpers.
5. Unit tests for room-code derivation and repository behavior.

done_when:

1. Domain tests pass without HTTP, DB, Feishu, or Hermes.
2. Room status model supports checkout-relevant states.
3. In-memory ports are replaceable by future persistence.

stop_boundary:

1. Stop before persistence migrations or unrelated PMS workflows.

### `S4` — checkout-dry-run

- Owner: `execute-plan`
- State: `QUEUED`
- Priority: `high`

目标：

- Implement `checkOut` dry-run planning without mutating state.

必须交付：

1. `checkOut(command)` for `dryRun=true`.
2. Structured dry-run plan.
3. Stable errors for invalid metadata/state.
4. Tests proving dry-run does not mutate room, task, audit, or idempotency state.

done_when:

1. Dry-run tests pass for allowed and invalid room states.
2. No audit entry or housekeeping task is created during dry-run.
3. Plan is structurally testable and explainable by future Hermes tools.

stop_boundary:

1. Stop before confirm execution if dry-run semantics are unstable.

### `S5` — checkout-confirm

- Owner: `execute-plan`
- State: `QUEUED`
- Priority: `high`

目标：

- Implement confirmed checkout execution with idempotency, audit, and events.

必须交付：

1. `checkOut(command)` for `confirm=true`.
2. Room transition to vacant + dirty.
3. Housekeeping checkout-cleaning task.
4. Audit log entry.
5. `RoomCheckedOut` and `HousekeepingTaskCreated` events.
6. Idempotency behavior preventing duplicate side effects.

done_when:

1. Confirm tests pass for allowed states.
2. Duplicate idempotency test prevents duplicate task/double mutation.
3. Audit and event metadata are asserted.
4. Invalid confirm fails with stable error.

stop_boundary:

1. Stop before external side effects such as Feishu notification or DB outbox.

### `S6` — core-proof-closeout

- Owner: `execute-plan`
- State: `QUEUED`
- Priority: `medium`

目标：

- Harden the PMS Core checkout slice and prepare the R3 PMS API/MCP successor plan.

必须交付：

1. Test matrix documentation for checkout transitions.
2. `packages/core` README or docs explaining command behavior, errors, and events.
3. Verification evidence.
4. Successor plan recommendation for PMS API/MCP.

done_when:

1. All PMS Core tests pass.
2. Checkout command is documented enough for future API/MCP implementation.
3. R3 successor scope is explicit.

stop_boundary:

1. Stop before implementing API/MCP or Feishu projection in the same slice.
