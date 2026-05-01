# adapter-feishu agent policy

## Service role

`adapter-feishu` owns Feishu ingress, message/card delivery, typed-card callback transport, chat/user allowlists, dedupe, and bounded Feishu Base adapter seams for the PMS/Feishu product path.

Active product chain:

```text
Feishu
  -> adapter-feishu
  -> ai-conversation
  -> ai-pms
  -> pms-platform
```

Ownership split:

- `adapter-feishu`: Feishu ingress, message/card delivery, typed-card callback transport, allowlists, dedupe, provider routing, short-lived callback state, and managed Base adapter seams.
- `ai-conversation`: Pi/LLM conversation continuity, semantic routing, safe tool planning, deterministic policy/PlanCompiler gate use, and grounded natural-language replies.
- `ai-pms`: PMS workflow orchestration, dry-run/confirm identity law, pending/callback/outbox state, projection coordination, and typed endpoint contracts.
- `pms-platform`: PMS domain truth, persistence, state transitions, read models, audits, idempotency, and business invariants.

## Boundary law

`adapter-feishu` must remain a Feishu transport and typed-callback adapter:

- natural-language chat is forwarded to `ai-conversation` for semantic interpretation;
- typed-card callbacks are forwarded to `ai-pms` for workflow confirmation handling;
- Base writes remain managed/registry-bound and never PMS truth;
- provider routing, short-lived pending callback state, allowlists, and dedupe are transport concerns only;
- Feishu card/message rendering may present PMS workflow results but must not decide PMS business eligibility or state transitions.

`adapter-feishu` must not become a conversation, workflow, or PMS truth owner:

- does not own Pi Agent runtime or LLM semantic routing;
- does not own natural-language PMS policy or PlanCompiler decisions;
- does not own PMS workflow truth, dry-run/confirm identity law, pending/callback/outbox orchestration, or projection coordination;
- does not own PMS domain truth, persistence, state transitions, read models, audits, idempotency, or business invariants;
- does not expose arbitrary HTTP, shell, file, SQL, direct PMS platform, generic Base/Bitable, or customer-chat tools.

## Dependency boundary

Do not add `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, or LLM/agent runtime packages to this repo. The Feishu SDK dependency belongs here; Pi/LLM conversation runtime belongs in `ai-conversation`; PMS workflow orchestration belongs in `ai-pms`; PMS truth belongs in `pms-platform`.

## Validation

`npm run verify` is the repo-local verification ladder. It must run `scripts/check-boundaries.mjs` before build/test so accidental Pi Agent/LLM runtime drift fails before Feishu transport verification proceeds.
