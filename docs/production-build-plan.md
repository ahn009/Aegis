# Velora production build plan

Status: **audit and planning in progress** · Started: 2026-09-29 · Source of truth for execution: [production-tracker.md](production-tracker.md)

## Goal and launch contract

Ship an AI-operated daily operations system that reports only real outcomes, protects each organization's data, keeps an accountable record of every agent action, and can be deployed, observed, backed up, and rolled back. A feature is production complete only when its real integration, failure behavior, tests, operator instructions, and deployment check are complete. A visual placeholder, mock success, or passing unit test alone does not close a task.

**Launch scope:** live inbound voice, SMS, dashboard, and AI agents for daily operations. The operator selected the OpenAI API. [ADR 0006](adr/0006-production-platform-target.md) proposes Twilio, paid Render Ohio, and managed Postgres as the working integration/deployment target; provider and hosting acceptance is pending. A later product increment should allow operators to disable individual services temporarily. CRM scope remains undecided.

## Audit baseline

This is a source audit, not a certification. I reviewed the application routes, auth/session boundary, webhook paths, AI provider/orchestrator/tool executor, domain services, worker, schema, seed, deployment scripts, UI placeholder scan, and existing tests. The repository has about 9,800 lines across these first-party paths. Generated `src/components/ui/*` controls are inventoried as vendor-style UI code; any component used by a product screen must still pass interaction and accessibility checks. The detailed [Phase 0 source review register](phase-0-source-review.md) maps route permissions and placeholder dispositions; deeper phase-specific review remains explicit there.

Node 24/npm is the selected runtime, and a clean temporary-directory lockfile install passes. CI has passed clean install, Prisma generation, typecheck, lint, 13 tests, and build. The default Turbopack build hit a sandbox process restriction, so the build script now selects webpack. Removing unused dependencies and applying a scoped Prisma config override reduced the production dependency audit from nine advisories to zero locally; the override still needs a clean CI run. These results are a baseline, not a production release gate.

### Verified production gaps

| ID | Severity | Evidence | Required outcome |
| --- | --- | --- | --- |
| P0-01 | Blocker | `src/app/api/webhooks/voice/route.ts` returns JSON with a `twiml` field; `src/lib/ai/tool-executor.ts` returns `transferred: true` after an audit write. | Real provider voice response and transfer/voicemail path; never report a transfer until the provider confirms it. |
| P0-02 | Blocker | `src/lib/domain/messaging.ts` stores outbound SMS as `SENT` without a provider request; `STAFF_NOTIFY` in `src/lib/worker/outbox.ts` writes an audit record only. | Real sends, delivery callbacks, retries, truthful status, and working staff notification. |
| P0-03 | Blocker | Webhook verification is opt-in (`VELORA_VERIFY_WEBHOOKS=0`); `call-status` has no signature check; webhook routes accept caller-supplied `organizationId` and otherwise choose the first organization. | Require provider signatures in production and resolve tenant from a verified destination number/account mapping. Reject unknown destinations. |
| P0-04 | Blocker | `src/lib/env.ts` silently uses development encryption/session secrets in production and defaults the AI provider to `mock`. | Validate required secrets and provider settings on startup; production must fail closed. |
| P0-05 | Blocker | `next.config.ts` has `typescript.ignoreBuildErrors: true`; no CI workflow is present. | Typecheck, lint, tests, migrations, and build must fail the release when broken. |
| P0-06 | Blocker | `scripts/seed.ts` creates fixed demo accounts and sample data; `.env` and `db/custom.db` were tracked. A read-only metadata check found 3 organizations, 3 users, 1 session, 10 contacts, 5 calls, and 7 SMS rows in the database. | Separate development fixture data from one-time production bootstrap. Treat Git history as exposed data until reviewed; invalidate sessions and rotate any real secrets or credentials before launch. |
| P0-07 | Blocker | `src/lib/session.ts` stores no active organization on a session and always selects the first membership; `createSession` accepts an organization but does not persist it. | Persist selected tenant in the session and test multi-organization login/switching and role changes. |
| P1-01 | High | `src/lib/worker/outbox.ts` reads due events then marks them `PROCESSING`, with no atomic claim or lease; a second worker/manual trigger can process the same event. | Atomic claim, lease recovery, idempotent provider send, retry/dead-letter and reconciliation tests. |
| P1-02 | High | `src/lib/ai/provider-openai.ts` has hand-written best-effort schema conversion, no fetch timeout, and tool result messages can carry an empty tool-call ID. | Provider contract tests, valid tool-call message history, schema generation, timeout/retry policy, and safe fallback. |
| P1-03 | High | `src/app/api/simulate-call/turn/route.ts` retries `runTurn` after any error, even if the first call already persisted messages or side effects. | Separate provider failure from domain failure and make turn execution idempotent. |
| P1-04 | High | `src/lib/domain/appointments.ts` confirms a held slot outside a transaction; booking follow-up audit/reminders run after commit. | Atomic state transitions, durable reminder enqueue, concurrency tests, and explicit compensation/reconciliation. |
| P1-05 | High | `src/app/api/appointments/[id]/confirm` and `/cancel` accept any authenticated role; the shared wrapper has no origin/CSRF check despite a stored CSRF token. | Permission matrix for every mutation and same-origin or CSRF enforcement for cookie-authenticated writes. |
| P1-06 | High | `src/lib/rate-limit.ts` only tracks known users, per account; unknown emails have no IP throttle. `getClientIp` trusts forwarded headers. | Trusted-proxy policy plus persistent login abuse controls for known and unknown accounts. |
| P1-07 | High | `Caddyfile` permits `XTransformPort` to select a localhost proxy target. `.zscripts/*` refer to `/home/z/my-project` and generated preview artifacts. | Remove preview-only routing from production config and create a reproducible, environment-neutral deployment bundle. |
| P1-08 | High | `prisma/schema.prisma` uses SQLite; `db:push` includes `--accept-data-loss`; no checked-in migrations or backup/restore drill. | Chosen production database, versioned migrations, backup, restore, retention, and booking-race tests on that database. |
| P2-01 | Medium | `src/app/api/route.ts` returns “Hello, world!”; the README and analytics UI still state mock outcomes as if operational. | Remove dead placeholder endpoints and distinguish simulator data from live data in UI and docs. |
| P2-02 | Medium | Availability/reminders include fixed `America/Chicago` formatting in the worker; seed holiday dates are static. | Use organization timezone and live business rules, with DST and annual-rule tests. |
| P2-03 | Medium | `public/robots.txt` allows all crawlers on an authenticated operations app. | Decide indexing policy, set security headers and cache controls, and test private pages/API responses. |
| P2-04 | Medium | `package.json` includes broad template dependencies with no observed product imports; build/start scripts depend on Bun while this environment lacks Bun. | Trim unused packages after import analysis and pin a supported runtime with deterministic installs. |
| P0-08 | High | `npm audit --omit=dev --json` reports nine production advisories (five high, four moderate), including image processing and transitive parser packages. | Remove unused packages, update needed ones safely, and record a clean audit or reviewed residual risk before release. |
| P1-09 | High | Current AI flow handles one simulated call turn; there is no agent job registry, durable task execution, approval policy, or operator review queue for day-to-day work. | Define bounded agent roles, task/event model, action permissions, approval thresholds, replayable records, and a human override. |

### Placeholder policy

Classify every `mock`, `demo`, `sample`, `stub`, `TODO`, `localhost`, fake `SENT`, and fixed phone/email value found by search as one of: **development fixture**, **test-only**, **real integration task**, or **remove**. Simulator functionality may remain as an explicitly labeled, access-controlled test tool. It must never write into live customer metrics by default or imply a real call/SMS/transfer occurred. Search results are a triage list; input placeholders in forms are normal UI copy and are not defects.

### File review register

| Area | Files | Review status | Closure evidence |
| --- | --- | --- | --- |
| Runtime/config/deploy | `package.json`, `next.config.ts`, `Caddyfile`, `.zscripts/*`, `.env`, `public/*` | First pass complete; line review and replacement pending | Reproducible build, config validation, deploy smoke test |
| Schema/data | `prisma/schema.prisma`, `db/custom.db`, `scripts/seed.ts` | First pass complete; data audit pending | Migrations, safe bootstrap, backup/restore drill |
| Auth/API boundary | `src/lib/{env,session,auth-context,http,with-api,rate-limit,webhook-security,crypto,password}.ts`, `src/app/api/auth/*` | First pass complete; line review pending | Threat model plus authenticated/unauthenticated route tests |
| Webhook/call/SMS | `src/app/api/webhooks/*`, `src/lib/domain/{calls,messaging}.ts` | First pass complete; integration missing | Provider sandbox call and SMS receipts, signature/tenant tests |
| AI/tool flow | `src/lib/ai/*`, `src/app/api/simulate-call/*` | First pass complete; provider behavior review pending | Replay tests including failure/retry and no false success |
| Rules/scheduling/worker | `src/lib/rules/*`, `src/lib/domain/{appointments,service-area}.ts`, `src/lib/worker/*`, `scripts/worker.ts` | First pass complete; concurrency review pending | Race, DST, retry and cancellation tests |
| Dashboard/API reads | `src/components/dashboard/*`, `src/app/api/{overview,analytics,calls,contacts,leads,appointments,audit,rules,worker}/*` | Placeholder and route scan complete; interaction review pending | Role-based browser test on desktop/mobile, empty/error/live states |
| Generic UI | `src/components/ui/*`, `src/hooks/*` | Inventory only | Audit used components; remove unused components/dependencies |
| Existing tests/docs | `tests/*`, `README.md`, `docs/adr/*`, `worklog.md`, `examples/*` | First pass complete; claims need reconciliation | Tests run in CI; docs match implemented behavior |

## Phased implementation

### Phase 0 — Baseline and truthful product surface

1. Reproduce install, typecheck, lint, unit/integration tests, and build with pinned runtime. Capture results in the tracker.
2. Finish the file review register and placeholder inventory, recording each finding by ID.
3. Remove public demo credentials and `Hello, world!`; split development fixtures from production bootstrap; mark simulator data and screens clearly.
4. Rewrite README status claims so implemented, simulated, and planned behavior are distinct.

**Exit gate:** build and tests reproducible; no default credentials or fake live outcomes on the production surface; every placeholder has a disposition.

### Phase 1 — Security and tenancy foundation

1. Fail startup for missing/weak production secrets, unsigned webhooks, mock production provider, invalid origin/base URL, or missing provider credentials.
2. Bind active organization to the session; apply tenant and role checks to every read/mutation; add CSRF/origin enforcement and trusted proxy rules.
3. Authenticate all provider callbacks, map verified destination to tenant, deduplicate atomically, and redact sensitive payloads.
4. Add abuse controls, session expiry/rotation tests, audit durability policy, privacy retention and access controls.

**Exit gate:** cross-tenant and forged-callback attempts fail in integration tests; least-privilege user roles cannot mutate restricted resources.

### Phase 2 — Real integrations and truthful delivery

1. Implement the selected phone provider's live inbound voice flow, including STT/TTS or streaming gateway, interruption handling, transfer, voicemail, and call-status callbacks.
2. Implement outbound/inbound SMS with delivery status and STOP/START behavior; staff notification uses a real channel.
3. Define provider interfaces and sandbox contracts; keep deterministic mocks in tests and simulator only.
4. Add failure-mode tests for timeout, provider outage, duplicate callback, transfer failure, and retry without duplicate customer contact.

**Exit gate:** real sandbox call, transfer/voicemail, SMS send/receive, and status reconciliation proven with recorded evidence.

### Phase 3 — Reliable domain and data layer

1. Choose database topology and migration path; ensure booking overlap safety on the actual production database.
2. Make booking/confirmation/cancellation, audit, reminders, and outbound events atomic or reliably reconciled.
3. Add worker lease/claim semantics, idempotency at the provider boundary, dead-letter recovery, timezone correctness, backup/restore.
4. Keep simulated calls in an isolated dataset or explicit mode; make analytics count only the intended source.

**Exit gate:** concurrency and crash/retry tests pass; backup restore and migration rollback are demonstrated.

### Phase 4 — AI agents for daily operations

1. Define the first agent workflows: missed-call follow-up, lead triage, appointment coordination, reminders, exception handling, and daily summary. Record the business owner and permitted actions for each.
2. Give each agent a durable task record: trigger, tenant, inputs, plan, tool calls, approvals, outcome, retries, and cost. Keep a correlation ID across call, SMS, lead, appointment, outbox, and audit records.
3. Enforce scoped tools and policy in code. Let agents read and draft within their role; require a configurable approval for high-impact actions (for example, customer-facing messages, cancellations, rule changes) until measured performance supports wider autonomy.
4. Build an operator inbox for pending approvals, exceptions, failed tasks, and handoff. Include pause/disable switches per agent and per organization, plus replay in staging.
5. Evaluate real task success, false claims, duplicate actions, escalation quality, and customer impact using versioned scenarios and sampled review.

**Exit gate:** each enabled agent workflow completes a real end-to-end scenario, leaves a complete action trail, obeys its action policy, and can be paused or handed to a human without losing work.

### Phase 5 — Product operations and UX

1. Complete organization onboarding, integration credentials, business rules, supported services, hours/holidays, and phone number ownership.
2. Make dashboard actions available only to authorized roles; add honest loading/error/empty states and accessible keyboard/mobile interactions.
3. Reconcile current UI totals with database records, delivery receipts, and audit entries; remove implementation jargon from customer screens.

**Exit gate:** a new organization can be configured and operated without editing source files or running a demo seed.

### Phase 6 — Release engineering and launch

1. CI: format/lint/typecheck, tests, secret/dependency checks, migration validation, deterministic build and artifact attestation.
2. Staging with production-like providers; load, latency, disaster recovery, security and observability review.
3. Deployment manifests, health checks, alerts, runbooks, rollback and data restore procedure; execute a staged rollout.

**Exit gate:** all P0/P1 items closed with evidence, signed-off staging checklist, and owner-approved production cutover. Deployment is a separate action after a reviewable release candidate.

## Working rules for the tracker

- Statuses: `open`, `in_progress`, `blocked`, `verified`, `deferred` (with reason and owner). Do not mark `verified` without test/output evidence.
- Every change references one or more IDs, a test, and a residual risk. Update [production-tracker.md](production-tracker.md) in the same change.
- A phase closes only when every exit gate passes. If scope changes, record the decision and adjust gates before implementation.
- No irreversible deployment, production data migration, or provider purchase is implied by this plan.
