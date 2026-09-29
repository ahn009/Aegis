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
| P0-05 | 0 | in_progress | Verify CI on GitHub; local clean install, typecheck, lint, isolated tests, and webpack build pass | Passing CI run on pushed branch |
| P0-06 | 0 | in_progress | Review historical `.env`/database exposure and rotate any real credentials/sessions; bootstrap and demo-seed guard verified | No fixed credentials or fixture data in release artifact |
| P0-07 | 1 | open | Persist selected organization in session | Multi-org login/switch/role tests |
| P1-01 | 3 | open | Add atomic outbox claim and idempotent send | Two-worker race + crash/retry tests |
| P1-02 | 2 | open | Fix provider schema/history and timeout policy | Provider contract and failure tests |
| P1-03 | 3 | open | Make turn retry safe after partial writes | Retry test with one set of side effects |
| P1-04 | 3 | open | Make appointment transitions and reminders durable | Confirmation race and crash tests |
| P1-05 | 1 | open | Define mutation role matrix; enforce CSRF/origin | Viewer/technician denial and cross-site tests |
| P1-06 | 1 | open | Add trusted-IP and unknown-account abuse controls | Rate-limit tests across accounts/instances |
| P1-07 | 6 | in_progress | Replace ignored preview scripts and retire or rewrite shell tests that reference them | Environment-neutral staging deploy |
| P1-08 | 3 | open | Choose DB and write migrations/restore plan | Migration and restore evidence |
| P1-09 | 4 | open | Define agent roles, tasks and approval policy | Approved design + task schema and policy tests |
| P2-01 | 0 | in_progress | Review remaining route and UI claims; global preview notice and simulator/analytics copy now disclose simulated outcomes | Route/UX check |
| P2-02 | 3 | open | Remove fixed timezone and stale holidays | Org timezone/DST tests |
| P2-03 | 6 | open | Decide robots/security headers/cache policy | Header and crawler checks |
| P2-04 | 0 | verified | Node 24/npm runtime and lockfile install verified; obsolete Bun lockfile removed | Temporary-directory `npm ci --allow-remote=all` passed; local checks passed |
| P0-08 | 0 | in_progress | Resolve remaining Prisma/config/deepmerge-ts advisory chain; six findings cleared by removing unused direct packages | Clean production dependency audit or documented risk decisions |

## Phase 0 checklist

- [x] Inventory product code, schema, routes, deployment artifacts, tests, and placeholder markers.
- [x] Record initial production gaps with source evidence in the plan.
- [ ] Complete per-file line review register, including used UI controls and all route permissions.
- [ ] Confirm launch scope, hosting, phone provider, AI provider, database, and deployment region.
- [ ] Capture CI logs on the pushed branch. A **clean** lockfile install, local typecheck, lint, tests, and webpack build pass as recorded below.
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

## Update template

When an item changes, update its status and add a log row with: date, ID, files changed, exact verification command/result, residual risk, and next owner/action. Keep failed checks in the log until superseded by a passing run.
