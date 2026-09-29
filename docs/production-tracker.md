# Production work tracker

Updated: 2026-09-29 · Plan: [production-build-plan.md](production-build-plan.md)

## Current position

Phase 0 is **in progress**. The launch target is AI agents performing daily operations with a trace of every action. Live voice and SMS remain in the production gate until the launch scope is confirmed. No phase is verified and the application is **not production ready**.

Legend: `open` = not started; `in_progress` = work underway; `blocked` = cannot proceed without a named dependency; `verified` = acceptance evidence recorded; `deferred` = explicitly removed from release scope with reason.

| Phase | Status | Exit evidence needed |
| --- | --- | --- |
| 0. Baseline and truthful surface | in_progress | Reproducible checks; placeholder inventory and disposition; no production demo access |
| 1. Security and tenancy | open | Cross-tenant, role, CSRF/origin and webhook tests pass |
| 2. Real integrations | open | Recorded provider sandbox call, transfer, SMS, and delivery status |
| 3. Reliable data and jobs | open | Concurrency/crash tests; migrations; backup/restore drill |
| 4. Daily operations agents | open | Bounded workflows with complete action logs, review queue and pause switch |
| 5. Product operations and UX | open | New org operates without source edits; browser and accessibility checks |
| 6. Release engineering | open | CI and staging gates; runbook; reviewed cutover candidate |

## Work items

| ID | Phase | Status | Next checkable step | Evidence when complete |
| --- | --- | --- | --- | --- |
| P0-01 | 2 | open | Select voice provider and implement live inbound/transfer path | Sandbox call trace + transfer receipt |
| P0-02 | 2 | open | Replace fake SMS `SENT` and audit-only staff notice | Provider message IDs, delivery/failure callbacks |
| P0-03 | 1 | open | Authenticate all callbacks; map verified destination to tenant | Forged callback and wrong-tenant integration tests |
| P0-04 | 1 | open | Validate production secrets and provider config at startup | Failing startup tests for missing/weak values |
| P0-05 | 0 | in_progress | Add CI and run clean typecheck/build; `ignoreBuildErrors` removed | `typecheck`, lint, tests, build logs in CI |
| P0-06 | 0 | in_progress | Build production bootstrap; review Git history and rotate any real credentials/sessions. Demo seed now refuses `NODE_ENV=production`. | No fixed credentials or fixture data in release artifact |
| P0-07 | 1 | open | Persist selected organization in session | Multi-org login/switch/role tests |
| P1-01 | 3 | open | Add atomic outbox claim and idempotent send | Two-worker race + crash/retry tests |
| P1-02 | 2 | open | Fix provider schema/history and timeout policy | Provider contract and failure tests |
| P1-03 | 3 | open | Make turn retry safe after partial writes | Retry test with one set of side effects |
| P1-04 | 3 | open | Make appointment transitions and reminders durable | Confirmation race and crash tests |
| P1-05 | 1 | open | Define mutation role matrix; enforce CSRF/origin | Viewer/technician denial and cross-site tests |
| P1-06 | 1 | open | Add trusted-IP and unknown-account abuse controls | Rate-limit tests across accounts/instances |
| P1-07 | 6 | open | Replace preview Caddy/deploy scripts | Environment-neutral staging deploy |
| P1-08 | 3 | open | Choose DB and write migrations/restore plan | Migration and restore evidence |
| P1-09 | 4 | open | Define agent roles, tasks and approval policy | Approved design + task schema and policy tests |
| P2-01 | 0 | in_progress | Reconcile remaining mock UI claims; hello-world endpoint removed | Route/UX check |
| P2-02 | 3 | open | Remove fixed timezone and stale holidays | Org timezone/DST tests |
| P2-03 | 6 | open | Decide robots/security headers/cache policy | Header and crawler checks |
| P2-04 | 0 | open | Inventory imports; pin runtime/install | Lockfile-based clean install |

## Phase 0 checklist

- [x] Inventory product code, schema, routes, deployment artifacts, tests, and placeholder markers.
- [x] Record initial production gaps with source evidence in the plan.
- [ ] Complete per-file line review register, including used UI controls and all route permissions.
- [ ] Confirm launch scope, hosting, phone provider, AI provider, database, and deployment region.
- [ ] Run clean install, typecheck, lint, tests, and build; save exact commands and results.
- [ ] Remove or isolate every production-facing demo/fake behavior and reconcile README claims. The demo login shortcut is now excluded from production builds.
- [ ] Review historical `.env` and `db/custom.db` exposure, invalidate the stored session, and rotate any real values. Both files are now untracked and ignored locally; Git history is unchanged.

## Decisions needed

| Decision | Current assumption | Impact |
| --- | --- | --- |
| Launch channel | Live voice and SMS | Determines Phase 2 gate and provider work |
| Hosting/region | Undecided | Database, worker, secrets and deployment design |
| Phone/SMS provider | Undecided | Callback protocol, tenant mapping and delivery receipts |
| AI provider/model | Undecided | Provider contract, cost and latency targets |
| Agent autonomy | Start with approvals for customer-visible or destructive actions | Policy and review queue design |
| CRM integration | Undecided; no-op field exists today | Onboarding and data synchronization scope |

## Verification log

| Date | Action | Result |
| --- | --- | --- |
| 2026-09-29 | Source inventory and targeted production-path review | Findings P0-01 through P2-04 recorded in plan; remaining per-file review tracked above |
| 2026-09-29 | `rg` placeholder scan | Found simulated voice/SMS, demo seed/login, fixed dates/numbers, preview deploy artifacts and hello-world route |
| 2026-09-29 | `git ls-files db .env .zscripts` | `.env`, `db/custom.db`, and preview scripts are tracked |
| 2026-09-29 | Dependency/build check | `node_modules` absent and `bun` unavailable; current build/test result unknown |
| 2026-09-29 | Phase 0 cleanup: `next.config.ts`, login, seed, `/api`, README | Build no longer ignores TS errors; public hello-world route removed; demo shortcut hidden and demo seed disabled in production; README labels simulated paths. Runtime checks remain pending. |
| 2026-09-29 | Tracked data review and containment | Read-only metadata: 3 organizations, 3 users, 1 session, 10 contacts, 5 calls, 7 SMS rows. `.env` and `db/custom.db` removed from Git index only, added to `.gitignore`, and preserved on disk. Historical exposure/rotation remains open. |

## Update template

When an item changes, update its status and add a log row with: date, ID, files changed, exact verification command/result, residual risk, and next owner/action. Keep failed checks in the log until superseded by a passing run.
