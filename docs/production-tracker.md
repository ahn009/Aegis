# Production work tracker

Updated: 2026-09-30 · Plan: [production-build-plan.md](production-build-plan.md)

## Current position

Phase 0 is **verified**. Phase 1 is next. The launch target includes live inbound calls, SMS, the dashboard, and AI agents performing daily operations with a trace of every action. OpenAI API is selected. Twilio + paid Render Ohio + managed Postgres is the provisional implementation target in [ADR 0006](adr/0006-production-platform-target.md); provider accounts and deployment remain undecided. The application is **not production ready**.

Legend: `open` = not started; `in_progress` = work underway; `pending` = deliberately paused for later continuation; `blocked` = cannot proceed without a named dependency; `verified` = acceptance evidence recorded; `deferred` = explicitly removed from release scope with reason.

| Phase | Status | Exit evidence needed |
| --- | --- | --- |
| 0. Baseline and truthful surface | verified | [CI run 36718898437](https://github.com/ahn009/Aegis/actions/runs/36718898437) passed; provisional platform target and historical fixture policy recorded |
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
| P0-05 | 0 | verified | Preserve CI gate as changes continue | [GitHub Actions run 36597887050](https://github.com/ahn009/Aegis/actions/runs/36597887050): clean install, Prisma generation, typecheck, lint, 13 tests, build pass |
| P0-06 | 0 | verified | Preserve fixture isolation; never deploy or restore tracked historical DB | Historical DB is demo-domain/555 fixture; local session invalidated; clean bootstrap required for deployment |
| P0-07 | 1 | open | Persist selected organization in session | Multi-org login/switch/role tests |
| P1-01 | 3 | open | Add atomic outbox claim and idempotent send | Two-worker race + crash/retry tests |
| P1-02 | 2 | open | Fix provider schema/history and timeout policy | Provider contract and failure tests |
| P1-03 | 3 | open | Make turn retry safe after partial writes | Retry test with one set of side effects |
| P1-04 | 3 | open | Make appointment transitions and reminders durable | Confirmation race and crash tests |
| P1-05 | 1 | open | Define mutation role matrix; enforce CSRF/origin | Viewer/technician denial and cross-site tests |
| P1-06 | 1 | open | Add trusted-IP and unknown-account abuse controls | Rate-limit tests across accounts/instances |
| P1-07 | 6 | pending | Preview Caddy config, websocket examples, and shell tests removed; create environment-neutral staging deploy | Staging deployment and smoke test |
| P1-08 | 3 | open | Choose DB and write migrations/restore plan | Migration and restore evidence |
| P1-09 | 4 | open | Define agent roles, tasks and approval policy | Approved design + task schema and policy tests |
| P2-01 | 0 | verified | Preserve truthful preview labels and production guards until real integrations replace them | Production browser: simulator hidden, authenticated route 404, webhooks 503, no page errors/overflow |
| P2-02 | 3 | open | Remove fixed timezone and stale holidays | Org timezone/DST tests |
| P2-03 | 6 | open | Decide robots/security headers/cache policy | Header and crawler checks |
| P2-04 | 0 | verified | Node 24/npm runtime and lockfile install verified; obsolete Bun lockfile removed | Temporary-directory `npm ci --allow-remote=all` passed; local checks passed |
| P0-08 | 0 | verified | Monitor upstream Prisma support and repeat production audit in release CI | Scoped override passed clean CI Prisma generation, typecheck, tests and build; local production audit has zero findings |

## Phase 0 checklist

- [x] Inventory product code, schema, routes, deployment artifacts, tests, and placeholder markers.
- [x] Record initial production gaps with source evidence in the plan.
- [x] Record first-pass source review, used UI controls, placeholder dispositions, and all route permissions in [phase-0-source-review.md](phase-0-source-review.md). Later phase gates own deeper security and interaction verification.
- [x] Record provisional provider and hosting working target. Live voice/SMS plus dashboard/agents and OpenAI API are confirmed; [ADR 0006](adr/0006-production-platform-target.md) selects Twilio, paid Render Ohio, and managed Postgres for implementation without committing to a purchase or deployment.
- [x] Capture CI logs on the pushed branch. A **clean** lockfile install, typecheck, lint, tests, and webpack build pass in [run 36597887050](https://github.com/ahn009/Aegis/actions/runs/36597887050).
- [x] Verify production browser surface after disabling simulator routes and fake live integrations; README claims are reconciled. Local desktop/mobile browser checks passed; clean CI on this commit remains pending.
- [x] Finalize historical artifact disposition. Historical `.env` has only a database URL; the database has demo-domain users and `555` phone values. One unexpired local session was invalidated after a local backup. Keep history intact for traceability; treat all historical database blobs as exposed demo fixtures and never deploy or restore them. Production starts from an empty database and operator-supplied bootstrap credentials. If real customer data or reusable secrets are later found, reopen the incident decision before release.

## Decisions needed

| Decision | Current assumption | Impact |
| --- | --- | --- |
| Launch channel | Live voice, SMS, dashboard, and AI operations confirmed | Determines Phase 2 and 4 gates |
| Hosting/region | Paid Render, Ohio provisional implementation target; operator choice pending before resource creation | Database, worker, secrets and deployment design |
| Phone/SMS provider | Twilio provisional implementation target; operator choice pending before provider account setup | Callback protocol, tenant mapping and delivery receipts |
| AI provider/model | OpenAI API selected; model and spend policy pending | Provider contract, cost and latency targets |
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
| 2026-09-29 | P1-07 preview script containment | `.zscripts/` added to `.gitignore` and removed from the Git index; local files remain. Three shell tests under `tests/` still refer to these scripts and must be retired or rewritten before a clean-checkout test gate. |
| 2026-09-29 | Test safety, `vitest.config.ts`, `tests/setup.ts`, `scripts/run-tests.mjs`, `package.json` | `npm test` creates a fresh `/tmp/velora-test-*/test.db`, pushes schema, and refuses a non-test DB in setup. 13/13 tests pass. Local `.env` database was not touched. |
| 2026-09-29 | Type and lint baseline, shared API/rules types and dashboard effects | `npm run typecheck` exit 0; `npm run lint` exit 0. Initial failures included wrong API wrapper response types, untyped rule map, hardcoded test alias, and effect lint errors. |
| 2026-09-29 | Build baseline, `src/app/layout.tsx`, `src/app/globals.css`, `package.json` | `DATABASE_URL=file:/tmp/velora-build.db NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/next build --webpack` exit 0 outside sandbox. System fonts remove build-time Google font fetch. Build script now uses webpack and standalone start uses Node; a clean install and full script run remain open. |
| 2026-09-29 | P2-04 runtime and P0-05 CI changes | Node 24 engine, npm lockfile, npm-backed seed/worker/simulator scripts, README quickstart, and `.github/workflows/ci.yml` added. `node --import tsx` loaded a TypeScript app module. Clean `npm ci` verification is running in a temporary directory; CI has not run on GitHub. |
| 2026-09-29 | P0-08 initial `npm audit --omit=dev --json` | Nine advisories: five high, four moderate. Affected dependency families include `sharp`, Prisma config/`deepmerge-ts`, MDX editor/`js-yaml`, and syntax highlighter/PrismJS. |
| 2026-09-29 | P0-08 dependency cleanup and repeat audit | No imports found for MDX editor, syntax highlighter, or direct `sharp`. Removed all three and unused `bun-types`; Next includes a newer `sharp`. `npm audit --omit=dev --json` now reports three high findings in the Prisma/config/deepmerge-ts chain. A compatible fix is still open. |
| 2026-09-29 | P2-04 lockfile check | `npm ci --ignore-scripts --allow-remote=all --cache /tmp/velora-npm-cache` succeeded in a fresh temporary directory: 685 packages installed. Removed `bun.lock` and standardized scripts/docs on Node 24/npm. The isolated check omitted install scripts; normal CI install and Prisma generation are defined in `.github/workflows/ci.yml` and await GitHub execution. |
| 2026-09-29 | P0-05 local gate after dependency cleanup | `npm run typecheck` exit 0; `npm run lint` exit 0; `npm test` 13/13 pass on `/tmp/velora-test-*`; `DATABASE_URL=file:/tmp/velora-build.db NEXT_TELEMETRY_DISABLED=1 npm run build` exit 0. GitHub CI remains unverified until push. |
| 2026-09-29 | P2-01 production-facing copy scan | Found analytics text asserting `MockProvider is free` regardless of actual provider and simulator text implying completed transfers/SMS. Added a global preview notice, clarified simulator side effects and non-delivery, and marked analytics as including preview activity. Browser verification remains open. |
| 2026-09-29 | P0-06 bootstrap implementation and isolated check | Added `npm run bootstrap` for an empty database, requiring operator supplied organization/owner values, a valid timezone and a 16+ character password. It creates no fixed account or sample data. First run against `/tmp/velora-bootstrap-test-*/test.db` exited 0; a direct second run exited 1 with `Bootstrap requires an empty database`. The first combined subprocess check was inconclusive for the second run due sandbox `EPERM`; direct rerun resolved it. `rg` found no fixed demo credential in `.next/standalone` or `.next/static`. |
| 2026-09-29 | Phase 0 history metadata | `git log -- .env db/custom.db` shows these files in four prior commits, including the initial commit; they are now untracked/ignored. History review and credential/session rotation remain required before release. |
| 2026-09-29 | P0-05 GitHub CI run [36597229342](https://github.com/ahn009/Aegis/actions/runs/36597229342) | Clean `npm ci` and Prisma generation passed; `npm run typecheck` failed because `@types/node` was only available through local transitive dependencies. Lint, tests, and build were skipped. Added `@types/node` as a direct development dependency; a replacement CI run is required. |
| 2026-09-29 | P0-05 replacement [GitHub CI run 36597887050](https://github.com/ahn009/Aegis/actions/runs/36597887050) | Passed: `npm ci --allow-remote=all`, Prisma generation, typecheck, lint, 13 isolated tests, and webpack production build. P0-05 verified. |
| 2026-09-29 | P0-06 historical `.env` shape review | Historical `.env` versions contained only a `DATABASE_URL` key; no provider/app secret keys were present in that file. Values were not printed. The historical database still contains user/session material and remains a release blocker until assessed and invalidated as needed. |
| 2026-09-29 | P0-06 historical database read-only shape review | Two tracked SQLite revisions found. Latest had 3 organizations, 3 users with demo email domains, 1 session, 10 contacts, 5 calls, 7 SMS records; all checked phone fields contained `555`. The local session had future idle/absolute expiry dates. Backed up local `db/custom.db` to `/tmp/velora-session-backup-haupjf3n.db`, deleted its one session, and verified zero remain. No original values were printed. Historical Git blobs remain; deploy from a fresh database only. |
| 2026-09-29 | P0-08 Prisma advisory fix | Scoped `@prisma/config` override resolves `deepmerge-ts@8.0.2`; `npm audit --omit=dev --json` reports zero findings. Prisma client generation, isolated tests, and local production build pass. Clean CI still pending. Upstream [Prisma issue](https://github.com/prisma/orm/issues/30052) should be monitored so the override can be removed when native support lands. |
| 2026-09-29 | P2-01 fail-closed prototype paths | Production simulator helper returns 404; direct production-mode check passed. Production voice/SMS/status webhook handlers return 503 before processing; direct route checks passed for all three. Fake SMS sender, transfer tool, and staff notice refuse success in production. The simulator navigation is hidden in production. Browser check and clean CI still pending. |
| 2026-09-29 | P1-07 preview artifact cleanup | Removed `Caddyfile` with query-directed localhost proxy, preview websocket examples, and three shell tests tied to ignored `.zscripts/`. Staging deployment remains a Phase 6 task. |
| 2026-09-29 | P2-01 production browser check | Built standalone app against isolated `/tmp/velora-browser-*/test.db`. Desktop and mobile sign-in showed the preview notice, no simulator navigation, no page errors or horizontal overflow. Voice/SMS/call-status POST returned 503. With the secure session cookie supplied explicitly over local HTTP, `/api/auth/me` returned 200 and `/api/simulate-call/start` returned 404. Browser test server stopped. |
| 2026-09-29 | Pause checkpoint | Operator requested current progress be committed and pushed, with Phase 0 pending for later. Local `npm run typecheck`, lint, 13 tests, build, Prisma generation, and `npm audit --omit=dev --json` passed after the scoped override. A fresh GitHub CI run on this commit is the next verification step. |
| 2026-09-30 | Phase 0 checkpoint CI [run 36718898437](https://github.com/ahn009/Aegis/actions/runs/36718898437) | Clean install, Prisma generation, typecheck, lint, 13 tests, and production build all passed on `df6fcf0`. Scoped dependency override is exercised by clean CI; local production audit reports zero findings. |
| 2026-09-30 | P0-06 historical fixture disposition | Historical files contain a database URL and demo-domain/555 fixture records. Local session invalidated. Retain Git history for traceability, prohibit deployment or restore of historical DB blobs, and require empty database plus operator-provided bootstrap for production. Reopen if real customer data or reusable secrets are identified. |
| 2026-09-30 | Phase 0 closure | Provisional Twilio + paid Render Ohio + managed Postgres target recorded for implementation only. Phase 0 exit gate met; provider and hosting choice remains a release dependency. Phase 1 security and tenancy work is next. |

## Next steps

1. Complete Phase 1 security and tenancy controls, starting with production configuration validation and active-organization session binding.
2. Confirm or revise the provider/hosting choice before provider accounts or resources are created.
3. Preserve the Phase 0 gates as later phases change production behavior.

## Update template

When an item changes, update its status and add a log row with: date, ID, files changed, exact verification command/result, residual risk, and next owner/action. Keep failed checks in the log until superseded by a passing run.
