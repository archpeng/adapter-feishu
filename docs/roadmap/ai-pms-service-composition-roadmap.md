# AI-driven PMS service-composition roadmap

> Status: roadmap SSOT draft for the long-lived AI PMS architecture.
> Scope: split PMS, Feishu, `adapter-feishu`, and Hermes responsibilities into an executable dependency order.
> Repo context: this file lives in `adapter-feishu` because this repo is the existing Feishu integration anchor, but the target architecture is multi-service. This document is not an active `docs/plan/*` execution pack.

## 1. Target decision

Long-term PMS business capability **must not** live inside `adapter-feishu`.

Target ownership:

```text
Hermes Agent
  = AI operator, conversation, planning, tool calling, summaries, cron/tasks

PMS Core
  = PMS business truth, commands, state machines, policies, approval, idempotency, audit, events

adapter-feishu
  = Feishu/Lark channel adapter, message/card delivery, webhooks/callbacks, Base/Bitable adapter, managed form ingress

Feishu
  = human collaboration surface: forms, Base views, cards, approvals, notifications, dashboards
```

Hard rule:

```text
Hermes does not own PMS truth.
Feishu does not own PMS state machines.
adapter-feishu does not own PMS business rules.
PMS Core owns PMS business truth.
```

## 2. Current repo truth and transition constraint

| Area | Current fact | Transition meaning |
|---|---|---|
| `adapter-feishu` identity | Standalone Feishu/Lark channel service | Keep it as channel adapter / Feishu anti-corruption layer |
| Existing form path | `POST /providers/form-webhook` writes existing Feishu Base/Bitable records | Use as intake/projection bridge, not PMS core |
| Existing PMS artifacts | PMS registry examples and smart-intake docs exist | Treat as example/integration seed, not domain ownership |
| Active plan | `docs/plan/README.md` says no active pack | Create a new pack before implementation |
| Validation baseline | `npm run verify` passes in current repo | Every adapter change must keep this baseline |

## 3. Service boundary matrix

| Service / plane | Owns | May call | Must not own |
|---|---|---|---|
| Hermes Agent | Natural-language interface, tool selection, explanation, memory/skills, scheduled summaries, human-facing assistant behavior | PMS MCP/API; optionally `adapter-feishu` for pure notification helpers | Room state, order truth, direct Base writes for critical fields, status-machine decisions |
| PMS Core | Room/reservation/stay/housekeeping/maintenance domain, commands, state transitions, policies, idempotency, audit, approvals, domain events | PMS DB; outbox/event bus; `adapter-feishu` via integration worker; Hermes only as caller/tool client | Feishu SDK details, card rendering details, agent runtime, generic chat UX |
| adapter-feishu | Feishu auth, webhook/long-connection ingress, card/message delivery, Base/Bitable wrapper, managed `formKey` routing, provider callbacks, short-lived adapter state | Feishu Open API; PMS Core API for handoff if explicitly planned | PMS business state machine, long-term PMS truth, generic MCP/agent runtime |
| Feishu | Base tables/views/forms, cards, group notifications, approval interaction, operational dashboards | adapter-feishu endpoints/callbacks | Canonical PMS state machine, cross-system consistency, high-risk autonomous decisions |
| PMS DB / Event Store | Canonical records and events | PMS Core only | Human UI rules, Feishu presentation, AI prompts |
| Projection / Worker | Outbox delivery, Feishu Base projection, notification fanout, retry | PMS DB/outbox; adapter-feishu | Business decisions not already emitted by PMS Core |

## 4. Target architecture

### 4.1 MVP composition

Use this while proving product value quickly:

```text
Hermes Agent
  -> PMS MCP/API tools
  -> PMS Core
  -> adapter-feishu
  -> Feishu Base / Form / Card / Group
```

MVP allowance:

- Feishu Base may temporarily serve as operational storage/projection.
- Critical writes still go through PMS Core commands.
- Feishu forms create operation requests; PMS Core decides final state transitions.

### 4.2 Long-term composition

Use this for durable AI PMS:

```text
Users / Feishu / Hermes
        |
        v
PMS API / PMS MCP Server
        |
        v
PMS Core ----> PMS DB / Event Store ----> Outbox
                                      \-> Projection Worker -> adapter-feishu -> Feishu
```

Long-term rule:

- PMS DB/Event Store is canonical source of truth.
- Feishu Base is a collaboration/projection surface.
- Hermes is an authorized operator over PMS tools, not a database writer.

## 5. Dependency graph

```text
R0 Boundary freeze
  -> R1 Contracts package
    -> R2 PMS Core minimal kernel
      -> R3 PMS API/MCP tools
        -> R4 Hermes integration
      -> R5 Feishu projection through adapter-feishu
        -> R6 Feishu workbench/forms/cards
          -> R7 Pilot hardening
            -> R8 Full workflow expansion
              -> R9 External system integrations
```

Parallelizable tracks after R1:

```text
R2 PMS Core minimal kernel
R5 adapter-feishu projection hardening
R6 Feishu Base/view design
```

Do not start high-risk workflow automation until R2 command rules, idempotency, and audit exist.

## 6. Roadmap phases

### R0 — Boundary freeze and repo hygiene

| Field | Content |
|---|---|
| Priority | P0 |
| Depends on | Current repo truth |
| Goal | Prevent `adapter-feishu` from becoming PMS monolith or Hermes runtime. |
| Main changes | Add service-boundary docs; label existing PMS files as examples/integration seeds; keep `docs/plan/*` idle until an implementation pack is created. |
| In `adapter-feishu` | Keep PMS examples under `config/` or move later to `examples/pms/`; no PMS domain code. |
| Done when | A reader can tell where PMS Core, Hermes, Feishu, and adapter responsibilities live; no implementation needed. |
| Validation | `npm run verify`; docs agree with `README.md` and `docs/architecture/adapter-feishu-architecture.md`. |

### R1 — Shared contracts and command/event language

| Field | Content |
|---|---|
| Priority | P0 |
| Depends on | R0 |
| Goal | Define stable schemas before writing state machines or tools. |
| Suggested repo | New `pms-contracts` repo/package, or `packages/pms-contracts` in a PMS monorepo. |
| Artifacts | JSON Schema / TypeScript types for commands, events, operation requests, actor, idempotency, approval, Feishu projection records. |
| Required commands | `CheckOut`, `ReportMaintenance`, `HousekeepingDone`, `InspectionPass`, `InspectionFail`. |
| Required events | `RoomCheckedOut`, `MaintenanceReported`, `HousekeepingDone`, `RoomInspectionPassed`, `RoomInspectionFailed`, `OperationApprovalRequested`. |
| Required cross-cutting fields | `actor`, `source`, `reason`, `idempotencyKey`, `correlationId`, `dryRun`, `confirm`, `requestedAt`. |
| Done when | PMS Core, Hermes tools, and Feishu projection can import/use the same command/event contracts. |
| Validation | Contract tests; schema examples for success and stable failure payloads. |

### R2 — PMS Core minimal kernel

| Field | Content |
|---|---|
| Priority | P0 |
| Depends on | R1 |
| Goal | Create PMS business truth outside `adapter-feishu`. |
| Suggested repo | `pms-core` or `ai-pms/packages/pms-core`. |
| Owns | Room ledger, housekeeping task, maintenance ticket, operation request, approval request, audit log, idempotency. |
| First state model | `occupancyStatus`, `cleaningStatus`, `saleStatus`; derived `VC/VD/OC/OD/OOO/OOS`. |
| First commands | `getRoom`, `dashboard`, `checkOut`, `reportMaintenance`, `housekeepingDone`, `inspectionPass`, `inspectionFail`. |
| Must include | Dry-run plan, confirm gate, idempotency table, mandatory audit, stable domain errors. |
| Must not include | Feishu SDK, card templates, Hermes prompt logic. |
| Done when | Core commands can run against local storage and produce domain events without Feishu or Hermes. |
| Validation | Unit tests for state transition matrix, idempotency, audit creation, high-risk confirm rejection. |

### R3 — PMS API and MCP tool surface

| Field | Content |
|---|---|
| Priority | P0 |
| Depends on | R2 |
| Goal | Give Hermes and other operators a safe tool interface. |
| Suggested repo | `pms-mcp` / `pms-api` or package inside PMS monorepo. |
| Tool/API shape | Business tools only, not arbitrary table writes. |
| First tools | `pms_get_room`, `pms_dashboard`, `pms_check_out`, `pms_report_maintenance`, `pms_housekeeping_done`, `pms_inspect_room`. |
| Safety default | Mutating tools default to `dryRun=true`; real execution requires `confirm=true`; high-risk operations may return `approval_required`. |
| Done when | Hermes can call tools against PMS Core locally/sandbox without touching Feishu directly. |
| Validation | MCP/tool contract tests; dry-run then confirm smoke; prompt-injection fixtures cannot invoke raw write tools. |

### R4 — Hermes integration as AI operator

| Field | Content |
|---|---|
| Priority | P1 |
| Depends on | R3 |
| Goal | Use Hermes for conversation, explanation, planned tool use, and scheduled summaries. |
| Suggested repo | `pms-hermes` or `pms-agent-config`. |
| Hermes responsibilities | Skills/personality, PMS tool routing, user confirmation flow, summarization, manager daily report, follow-up questions. |
| Required guardrail | Hermes can call PMS tools; Hermes cannot directly update PMS DB or critical Feishu Base fields. |
| First scenarios | “0808 办退房”, “哪些房间影响入住”, “生成今日房态日报”, “0808 报修停卖”. |
| Done when | Hermes can produce dry-run explanations, request confirmation, execute via PMS Core, and report result. |
| Validation | Conversation smoke tests/transcripts; no direct Feishu write path in Hermes tools for critical fields. |

### R5 — adapter-feishu as Feishu anti-corruption layer

| Field | Content |
|---|---|
| Priority | P1 |
| Depends on | R0; can run in parallel with R2 after contracts stabilize |
| Goal | Keep and harden Feishu integration without absorbing PMS business rules. |
| In this repo | Continue supporting `/providers/form-webhook`, provider webhooks, card callbacks, Bitable wrapper, Feishu message/card delivery. |
| Possible additions | Bitable read/update seam only if needed by projection worker; stable card templates for PMS notifications; callback routing to PMS API. |
| Forbidden additions | `src/pms/domain/**`, checkout state machine in `formWebhook.ts`, Hermes runtime/MCP server as core identity. |
| Done when | PMS Core/worker can ask adapter to send cards/update Feishu projection through bounded endpoints/contracts. |
| Validation | `npm run verify`; adapter contract tests; Feishu SDK seam tests; no PMS nouns in provider-neutral contracts. |

### R6 — Feishu workbench and Base projection

| Field | Content |
|---|---|
| Priority | P1 |
| Depends on | R1; R5 for adapter-backed writes; R2 for canonical semantics |
| Goal | Make Feishu the human operations surface. |
| Tables/views | Room ledger, operation requests, housekeeping tasks, maintenance tickets, reservations, audit logs, dashboard views. |
| Forms | Checkout, maintenance report, housekeeping done, inspection result, maintenance close. |
| Cards | Approval request, task assignment, exception alert, daily summary. |
| Key rule | Forms submit operation requests; PMS Core executes or rejects. Feishu automation may assist, not replace state machine. |
| Done when | Frontdesk/housekeeping/maintenance/manager can operate through Feishu surfaces tied to PMS commands/events. |
| Validation | Sandbox Base setup; form submission -> operation request -> PMS command -> projection update -> notification smoke. |

### R7 — Pilot hardening

| Field | Content |
|---|---|
| Priority | P1 |
| Depends on | R2-R6 minimal path |
| Goal | Prepare single-property pilot. |
| Required controls | Auth tokens, Feishu app least privilege, Base permissions, config split, secret handling, backup/export, schema drift detection, manual recovery runbook. |
| Required observability | Structured logs, command/event correlation IDs, failed outbox retry visibility, adapter health checks. |
| Required tests | Domain tests, API/MCP tests, adapter tests, sandbox E2E smoke, duplicate/negative cases. |
| Done when | A single hotel can run core workflows with rollback/manual recovery documented. |
| Validation | Pilot checklist signed off; all automated tests pass; sandbox smoke evidence recorded. |

### R8 — PMS workflow expansion

| Field | Content |
|---|---|
| Priority | P2 |
| Depends on | R7 pilot feedback |
| Goal | Move from light room-ops PMS to broader frontdesk PMS. |
| Add commands | `checkIn`, `assignRoom`, `changeRoom`, `extendStay`, `cancelReservation`, `noShow`, `maintenanceComplete`, `restoreRoom`. |
| Add policies | Overbooking/conflict checks, manager approvals, room restore rules, reservation date conflict checks. |
| Keep separate | Finance/payment/official compliance connectors still separate tracks. |
| Done when | Frontdesk can manage check-in/out/change/extend/cancel flows with audit and approval. |
| Validation | Scenario tests across reservation + room + housekeeping + maintenance aggregates. |

### R9 — External integration tracks

| Field | Content |
|---|---|
| Priority | P3 |
| Depends on | R8 maturity and real operational need |
| Goal | Integrate systems that should not be part of the Feishu adapter. |
| Candidate services | OTA/channel manager connector, door-lock connector, payment/deposit service, invoice service, public-security upload connector, CRM/member connector, finance/night-audit service. |
| Rule | Each integration is its own adapter/connector with contracts/events; PMS Core remains business authority. |
| Done when | External system changes flow through PMS events/commands and are auditable/retryable. |
| Validation | Connector-specific contract tests, sandbox tests, compensation/retry tests. |

## 7. Priority order by dependency

| Order | Work item | Why first/next | Blocks |
|---:|---|---|---|
| 1 | R0 boundary freeze | Prevents wrong repo evolution | All implementation |
| 2 | R1 contracts | Prevents Hermes/PMS/Feishu mismatch | R2, R3, R5, R6 |
| 3 | R2 PMS Core minimal kernel | Creates business authority | R3, R4, real R6 execution |
| 4 | R3 PMS API/MCP | Creates safe AI tool surface | R4 |
| 5 | R5 adapter-feishu hardening | Enables Feishu projection/notification | R6, R7 |
| 6 | R6 Feishu workbench | Creates human operating surface | R7 |
| 7 | R4 Hermes integration | Can start after R3; best after first Feishu flow exists | AI operator pilot |
| 8 | R7 pilot hardening | Makes MVP safe enough for real operations | R8 |
| 9 | R8 workflow expansion | Adds complexity after minimal safety is proven | R9 |
| 10 | R9 external integrations | Highest coupling/risk, should wait | Full commercial PMS path |

Practical near-term sequence:

```text
1. Finish this roadmap doc.
2. Create a new active plan pack for R0-R1.
3. Create `pms-contracts` and minimal command/event schemas.
4. Create `pms-core` with local storage and five command tests.
5. Add PMS MCP/API tools over PMS Core.
6. Wire adapter-feishu as projection/notification layer.
7. Add Hermes config/skills using PMS tools.
8. Run Feishu sandbox pilot.
```

## 8. First vertical slice

The first end-to-end slice should avoid high complexity and prove all boundaries.

### Scenario: AI-assisted checkout

```text
User in Hermes/Feishu: “帮 0808 办退房，客人已离店”
  -> Hermes calls pms_check_out(dryRun=true)
  -> PMS Core validates current room state and returns plan
  -> User confirms
  -> Hermes calls pms_check_out(confirm=true)
  -> PMS Core writes audit + emits RoomCheckedOut and HousekeepingTaskCreated
  -> Projection worker calls adapter-feishu
  -> Feishu Base updates room/task projection
  -> Feishu card notifies housekeeping group
```

### Why this slice first

| Reason | Explanation |
|---|---|
| High product value | Checkout drives housekeeping and room availability. |
| Bounded domain | Requires room + housekeeping only; no payment/OTA/door lock. |
| Safety testable | Clear preconditions and postconditions. |
| Good AI demo | Dry-run explanation + human confirmation is easy to validate. |
| Good adapter demo | Uses Feishu notification/projection without moving PMS rules into adapter. |

### Done when

- PMS Core can dry-run and execute checkout.
- Hermes can explain and confirm the command.
- adapter-feishu sends the resulting notification/card.
- Feishu projection shows room changed to vacant/dirty and housekeeping task created.
- Duplicate `idempotencyKey` does not create duplicate tasks.
- All changes are auditable by `correlationId`.

## 9. AI-safe vs human-critical split

| Surface | AI-safe | Human-critical |
|---|---|---|
| Documentation | Roadmaps, runbooks, field mappings | Final boundary decisions |
| Feishu UI | Card templates, view docs, form labels | Approval semantics, permission model |
| Contracts | Examples, non-breaking additions | Breaking command/event changes |
| PMS Core | Read models, fixtures, simple validators | State machines, idempotency, locking, compensation |
| Hermes | Prompts, skills, summaries, dry-run explanations | Tool permission policy, direct execution of high-risk writes |
| Integrations | Projection formatting, retry messages | External system consistency and compensation |

Required guardrails before serious AI-assisted development:

- CODEOWNERS for PMS state machines, policy, idempotency, approval, finance/compliance.
- Banned imports: PMS Core must not import `adapter-feishu`; Hermes must not import PMS DB client; adapter must not import PMS domain internals.
- Contract tests for every command/event/tool.
- Mutating tools default to dry-run.
- High-risk commands require explicit confirmation and/or approval.

## 10. High-risk actions policy

| Action | Risk | Required gate before execution |
|---|---|---|
| `CHECK_OUT` | Medium | dry-run + confirm + idempotency + audit |
| `REPORT_MAINTENANCE` with stop-sell | High | dry-run + confirm; notify manager |
| `MAINTENANCE_CLOSE` / room restore | High | approval or inspection pass; never direct VC from maintenance close |
| `CHANGE_ROOM` | High | conflict check + confirm + audit |
| `EXTEND_STAY` | High | reservation conflict check + confirm |
| `CHECK_IN` | High | room availability + reservation validity + confirm |
| Payment/deposit/refund | Critical | separate finance service; human approval; not in early roadmap |
| Public-security upload | Critical | separate compliance connector; not in early roadmap |

## 11. Development and deployment decision

Decision:

```text
Do not build a single mono-service.
Use a PMS-focused monorepo for PMS-owned code.
Keep adapter-feishu as an independent repo/service.
Run Hermes as an independent runtime/service with PMS tool access.
Deploy the system as multiple Docker/container services.
```

Recommended ownership:

| Unit | Development home | Runtime form | Reason |
|---|---|---|---|
| PMS contracts/core/API/MCP/worker | New `pms-platform` monorepo | Multiple PMS-owned containers/packages | High internal coupling; contract/core/API/MCP/worker should evolve together. |
| `adapter-feishu` | Existing independent `adapter-feishu` repo | Independent container/service | Generic Feishu adapter; must not become PMS domain code. |
| Hermes | Upstream Hermes runtime + PMS-owned config/tooling | Independent container/service or host process | Agent runtime should be replaceable/upgradable; only talks to PMS tools. |
| Postgres / queue | Deploy config in `pms-platform` | Independent infrastructure services | PMS truth, audit, idempotency, and outbox need isolated persistence. |

Recommended runtime services:

```text
postgres
pms-api
pms-mcp
pms-worker
adapter-feishu
hermes
```

Service communication rules:

```text
Hermes -> pms-mcp or PMS API -> PMS Core
PMS Core -> DB/outbox
pms-worker -> adapter-feishu -> Feishu
Feishu -> adapter-feishu -> PMS API for callbacks/intake when needed
```

Secret isolation rules:

| Runtime | May hold | Must not hold |
|---|---|---|
| Hermes | LLM provider keys, Hermes memory/config, PMS MCP endpoint | PMS DB URL, Feishu app secret, raw Feishu form token |
| PMS API/Core | PMS DB URL, PMS auth secret | Feishu app secret unless absolutely required for a dedicated integration path |
| PMS worker | PMS DB/outbox access, adapter internal token | LLM provider keys |
| adapter-feishu | Feishu app ID/secret, Feishu webhook secrets, adapter auth tokens | PMS DB URL, Hermes memory/config |

Deployment baseline:

- Use Docker Compose for local/pilot deployment.
- Move to Kubernetes or another orchestrator only after pilot complexity demands it.
- Use Postgres outbox first; introduce Redis/NATS/Temporal only when retry/concurrency requirements justify it.
- PMS Core is a library/package imported by `pms-api` and `pms-worker`, not a separate all-powerful daemon by default.

## 12. Repository layout recommendation

### Preferred PMS monorepo plus independent adapter layout

```text
pms-platform/
  packages/
    contracts/              # commands, events, JSON schemas, shared fixtures
    core/                   # domain, policies, idempotency, audit, ports
    api/                    # HTTP route package over core
    mcp/                    # PMS tool server for Hermes
    worker/                 # outbox + projection workers
    hermes-config/          # skills, prompts, toolsets, conversation tests
    clients/
      adapter-feishu/       # typed HTTP client for adapter-feishu
  apps/
    pms-api/
    pms-mcp/
    pms-worker/
  deploy/
    docker-compose.yml
    env/*.env.example
  docs/
    architecture/
    roadmap/
    runbook/
    decisions/
```

Independent repo/service:

```text
adapter-feishu/
  Existing Feishu/Lark channel adapter.
```

Optional later split:

- Split `pms-hermes-config` into its own repo only if Hermes operations need a separate release cadence.
- Split `pms-contracts` into its own repo/package only if multiple independent products need it outside `pms-platform`.

Keep `adapter-feishu` separate unless there is a strong operational reason to vendor it.

## 13. Open decisions

| Decision | Options | Recommended default |
|---|---|---|
| PMS storage for MVP | Feishu Base only / SQLite / Postgres | Postgres if building long-lived product; Feishu Base acceptable only as MVP projection/storage with clear migration path |
| API between PMS Core and adapter | HTTP / queue / direct SDK client | HTTP or outbox worker -> adapter HTTP; avoid direct imports |
| Hermes connection | MCP server / HTTP tools / messaging gateway bridge | MCP server over PMS API/Core |
| Feishu ingress to Hermes | adapter bridge / native Hermes gateway if available later | adapter bridge; do not wait for native Feishu gateway |
| Repo topology | single mono-service / PMS monorepo / all multi-repo | PMS monorepo + independent `adapter-feishu`; deploy as multiple containers |
| Event sourcing | full event store / audit log + outbox | audit log + outbox first; event store later if needed |

## 14. Immediate next plan pack suggestion

Create a new active plan pack before coding:

```text
docs/plan/ai-pms-boundary-and-contracts-v1-PLAN.md
docs/plan/ai-pms-boundary-and-contracts-v1-STATUS.md
docs/plan/ai-pms-boundary-and-contracts-v1-WORKSET.md
```

Suggested active slice:

```text
Slice S1: R0-R1 only
- finalize service boundary doc
- decide repo topology
- create initial PMS command/event schemas
- add contract examples for checkout and maintenance report
- do not implement PMS Core yet
```

Done when:

- Service boundary is documented and agreed.
- `pms-contracts` location is chosen.
- Initial command/event schemas exist with tests/examples.
- `adapter-feishu` remains unchanged except docs if needed.
