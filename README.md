# Velora HVAC Response System

A multi-tenant, AI-receptionist operations platform for residential HVAC companies.

> **Architectural thesis (never violated):** AI interprets conversations; deterministic
> software controls business actions. The AI never owns data, authorization, pricing,
> availability, or truth. Every consequential action (booking, contact write, transfer,
> SMS) executes in a validated domain service with server-side org context. All AI output
> is treated as untrusted input.

Built to the **Velora HVAC Response System Engineering Specification v1.0.0**, adapted to
the deployment environment (Next.js 16 + Prisma/SQLite). Every HARD CONSTRAINT is
implemented and proven by an automated test suite. See `docs/adr/` for adaptation
decisions.

---

## Quickstart

```bash
# 1. Install deps (already done in this env)
bun install

# 2. Push the schema + run the seed (creates the DFW HVAC org, owner user, rules, sample contacts)
bun run db:push
bun run seed
# → prints OWNER credentials: owner@velorahvac.example / VeloraDemo2025!

# 3. Start the dev server (Next.js, port 3000)
bun run dev

# 4. Open the dashboard at / and sign in with the seeded credentials.
```

### Drive a full conversation with no Twilio/OpenAI

```bash
bun run simulate-call             # normal booking: greeting → intake → area → booking
bun run simulate-call --emergency # gas smell → immediate transfer
bun run simulate-call --out-of-area # Beverly Hills → request (never books)
```

### Run the worker (outbox: hold expiry, reminders, reconciliation)

```bash
bun run worker                    # standalone polling loop
# or trigger from the dashboard / POST /api/worker/run (ADMIN+)
```

### Run the safety test suite

```bash
bun run test                      # vitest — 12 tests covering every HARD CONSTRAINT
```

---

## What's mocked vs. real

| Component        | Status                                                                 |
|------------------|------------------------------------------------------------------------|
| AI provider      | **Mock** by default (deterministic, zero keys). OpenAI-compatible provider included; enable with `VELORA_AI_PROVIDER=openai` + `OPENAI_API_KEY`. |
| Twilio voice/SMS | **Simulated** via API webhooks. Signature verification implemented (`src/lib/webhook-security.ts`), gated behind `VELORA_VERIFY_WEBHOOKS=1`. |
| STT/TTS          | N/A — the simulator is text-in/text-out. Real STT/TTS would slot into the voice-gateway routes. |
| Database         | **Real** SQLite via Prisma. All tenancy, audit, booking, opt-out logic is live. |
| Worker/Queues    | **Real** outbox table + polling worker (in-process or standalone). At-least-once + idempotency keys. |
| Jobber/Housecall Pro CRM | **Interface only** — `externalCrmId` field + no-op adapter (out of scope per SPEC). |
| Google/Microsoft OAuth     | Interface/scaffold only (out of scope per SPEC). |
| pgvector         | Not used; Postgres FTS replaced by SQLite `LIKE` (ADR 0001). |

---

## Architecture

```
src/
  app/
    api/                      # Fastify-equivalent: Zod-validated route handlers
      auth/                   # login/logout/me (scrypt + DB sessions + lockout)
      overview, analytics     # KPI rollups
      calls, contacts, leads, appointments, audit   # list/detail + RBAC
      rules/                  # DRAFT → PUBLISH versioned rules
      simulate-call/          # start/turn/get — drives the orchestrator
      webhooks/               # voice, sms, call-status (signature + dedup)
      worker/run              # manual outbox trigger (ADMIN+)
    page.tsx                  # auth gate + dashboard shell
  components/dashboard/       # login, shell, overview, calls, contacts, leads,
                              # appointments, audit, analytics, simulate-call, rules
  lib/
    ai/                       # provider-mock, provider-openai, orchestrator,
                              # tool-schemas, tool-executor, state machine, prompts
    domain/                   # appointments, contacts, leads, calls, messaging,
                              # service-area  (the deterministic business logic)
    rules/                    # schemas (Zod) + versioned engine + DST-aware evaluators
    worker/                   # outbox processor (hold expiry, reminders, reconcile)
    db, crypto, password, session, auth-context, audit, phone, http, errors, env
  prisma/schema.prisma        # multi-tenant schema (every table carries organization_id)
scripts/
  seed.ts                     # DFW HVAC org + owner + rules + sample contacts
  simulate-call.ts            # end-to-end conversation driver (no external accounts)
  worker.ts                   # standalone outbox worker
tests/safety.test.ts          # 12 tests proving every HARD CONSTRAINT
docs/adr/                     # 5 architecture decision records
```

---

## HARD CONSTRAINTS — how each is enforced

1. **Tenancy** — every domain query filters by `organization_id` from the session, never
   client input. `orgScope()` + `assertTenant()` enforce it. Test §3 proves cross-tenant
   isolation.
2. **Tool calls** — Zod-validated args; org context injected server-side; invalid args →
   ONE repair round → safe fallback + escalation. Every attempt is audited. Test §2.
3. **AI prohibitions** — the AI may never invent pricing/availability, diagnose, invent
   transfer numbers, alter urgency, touch contact org/id/CRM links, or accept out-of-list
   services. Enforced in `tool-executor.ts` dispatch (service-area re-derivation, service
   gate, transfer-phone-from-rules). Tests §5, §8.
4. **Emergency** — safety keywords in caller speech → deterministic EMERGENCY
   classification (in the orchestrator, BEFORE the provider runs) → immediate transfer.
   Unreachable → voicemail + staff notification + persisted follow-up. Test §5.
5. **Booking** — transactional overlap re-check inside a write transaction; SQLite
   serializes writers so the re-check is atomic. Exactly-one-winner proven by Test §1.
6. **Webhooks** — signature verification (`webhook-security.ts`) + dedup on
   `(provider, externalId)`. Tests §4.
7. **Conversation state machine** — `assertTransition()` blocks illegal transitions in
   code, never by prompt alone. ESCALATION reachable from every state.
8. **Audit** — append-only `AuditLog`; no UPDATE/DELETE endpoints exist. Every mutation
   (USER / AI_TOOL / WORKER) writes one row. PII redacted.
9. **Safe degradation** — every external dependency has a fallback. AI failure mid-call →
   spoken apology → transfer/voicemail. Never false success.
10. **SMS** — STOP/UNSUBSCRIBE → immediate org-scoped suppression in the **sender service**
    (`messaging.ts`), not templates. Missed-call text-back only in permitted hours, once
    per CallSid, capped 1 per caller per 4h. Tests §6, §7.
11. **Secrets** — AES-256-GCM envelope encryption for integration creds
    (`crypto.ts`); never returned by API. PII redacted from audit/logs.
12. **Availability** — slots = business hours − holidays − active appointments − buffers,
    computed in org timezone, DST-aware (`evaluators.ts`).

---

## Environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `DATABASE_URL` | `file:.../custom.db` | SQLite path |
| `VELORA_AI_PROVIDER` | `mock` | `mock` or `openai` |
| `OPENAI_API_KEY` | _(empty)_ | Required if provider=openai |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model name |
| `VELORA_ENCRYPTION_KEY` | dev fallback | AES-256-GCM key for integration creds |
| `VELORA_SESSION_SECRET` | dev fallback | Session signing + webhook HMAC |
| `VELORA_VERIFY_WEBHOOKS` | `0` | Set `1` to enforce webhook signatures |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | _(empty)_ | Real Twilio (out of scope) |

---

## Spec deviations (see `docs/adr/`)

- **PostgreSQL → SQLite** (ADR 0001). Exclusion constraint → transactional re-check
  (ADR 0003). FTS → `LIKE`.
- **Argon2id → scrypt** (ADR 0002). Same memory-hard KDF properties, no native dep.
- **Fastify monorepo → single Next.js app** (ADR 0004). Package boundaries preserved as
  directory modules.
- **BullMQ/Redis → in-process outbox + polling worker** (ADR 0004). At-least-once +
  idempotency keys preserved.
- **Out of scope (interfaces only):** Jobber/Housecall Pro CRM, Google/Microsoft OAuth,
  pgvector, platform billing, MFA enrollment.

---

## Safety-constraint test summary

`bun run test` runs 12 tests across 9 SPEC constraints — all pass:

1. Concurrent booking race — exactly one winner ✓
2. Tool-validation failure → repair → fallback ✓
3. Cross-tenant blocked ✓
4. Webhook dedup + signature rejection ✓
5. Emergency keyword → escalation ✓
6. Missed-call recovery capping (1 per 4h) ✓
7. STOP suppression ✓
8. Out-of-area never books ✓
9. Hold expiry releases slot ✓
