# Phase 0 source review register

Updated: 2026-09-30. This register records the first pass through first-party application paths and the disposition of production-facing placeholders. Phase 1 changes to session tenancy and mutation origin checks are reflected below. A later phase owns the fixes where a finding ID is shown. The `src/components/ui/*` files are generated-style controls; only controls imported by a product screen are in the interaction review scope.

## API route and permission register

`Authenticated` means any signed-in role, including `VIEWER`; this is an observed permission, not an endorsement. All authenticated routes use the session organization, except where a finding says otherwise.

| Method and route | Current access | Source finding / next phase |
| --- | --- | --- |
| `POST /api/auth/login` | Public, same-origin mutation | P1-06: IP and unknown-account abuse controls |
| `GET /api/auth/me` | Public, returns null if signed out | Active organization persisted and checked against membership |
| `GET /api/auth/organizations` | Authenticated | Lists only caller's memberships for workspace selector |
| `POST /api/auth/switch-organization` | Authenticated, same-origin mutation | Target membership checked; active organization updated on session |
| `POST /api/auth/logout` | Authenticated, same-origin mutation | P1-05: consider CSRF token for stricter defense |
| `GET /api/overview`, `/api/analytics` | Authenticated | P2-01/P2-02: preview records in metrics and local-date handling |
| `GET /api/calls`, `/api/calls/[id]` | Authenticated | P0-07: tenant selection; otherwise organization-scoped |
| `GET /api/contacts`, `/api/contacts/[id]` | Authenticated | P0-07: tenant selection; otherwise organization-scoped |
| `GET /api/leads`, `/api/leads/[id]` | Authenticated | P0-07: tenant selection; otherwise organization-scoped |
| `PATCH/POST /api/leads/[id]/status` | `DISPATCHER`+ | P1-05: origin/CSRF; duplicate methods to simplify |
| `GET /api/appointments`, `/api/appointments/[id]/detail` | Authenticated | P0-07: tenant selection; otherwise organization-scoped |
| `POST /api/appointments/[id]/confirm`, `/cancel` | `DISPATCHER`+, same-origin mutation | P1-05: route-level denial and origin tests pending |
| `GET /api/audit` | `MANAGER`+ | Full audit records can contain sensitive details; lower roles denied |
| `GET /api/rules` | Authenticated | P0-07: tenant selection |
| `POST /api/rules`, `/api/rules/[id]/publish` | `MANAGER`+, same-origin mutation | P1-05: route-level denial tests pending |
| `GET /api/worker/status` | Authenticated; last error message visible to `ADMIN`+ | Queue counts remain visible to signed-in staff |
| `POST /api/worker/run` | `ADMIN`+, same-origin mutation | P1-01/P1-05: atomic job claim and route-level denial tests |
| `POST /api/simulate-call/start`, `/turn`; `GET /api/simulate-call/[conversationId]` | Authenticated in development; 404 in production | P1-03: retry safety; simulator must never write production metrics |
| `POST /api/webhooks/voice`, `/sms`, `/call-status` | Signed Twilio form and mapped number/call required in development; 503 in production | P0-01/02/03: real provider, durable processing and live callback tests |

## Placeholder disposition

| Source | Disposition | Release condition |
| --- | --- | --- |
| Fixed credentials and fixture records in `scripts/seed.ts` | Development fixture | Seed refuses production; one-time bootstrap creates no fixture data |
| Login demo-fill button | Development fixture | Excluded from production build; verify browser surface |
| `scripts/simulate-call.ts`, mock AI provider, simulator UI and routes | Development/test tool | Production route guard and hidden navigation; metrics isolation is Phase 3 |
| JSON voice webhook, SMS `SENT` without send, audit-only staff notice, audit-only transfer | Real integration tasks P0-01/02 | Production webhooks return 503; fake sender, notice, and transfer fail closed until Phase 2 |
| Caller-provided `organizationId` and first-org webhook fallback | Security task P0-03 | Production webhooks unavailable until verified destination mapping |
| `mock` AI provider and fallback secrets in `src/lib/env.ts` | Development defaults, security task P0-04 | Phase 1 startup validation must reject them in production |
| Demo `555` phones, fixed holidays and timezone | Development fixture and scheduling task P2-02 | New deployment uses empty bootstrap; organization rules must replace fixtures |
| `Caddyfile`, `.zscripts/`, preview websocket examples, and shell tests depending on preview scripts | Remove | Tracked preview artifacts removed; `.zscripts/` stays ignored locally |
| Form input `placeholder` attributes | UI copy | Keep; they are not fake backend behavior |

## First-party module review

| Area and files | Reviewed outcome | Follow-up |
| --- | --- | --- |
| Runtime: `package.json`, lockfile, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `public/*`, CI | One Node/npm path; clean install and CI pass. Production secrets still fall back. | P0-04, P1-07, P2-03 |
| Identity: `src/lib/{session,auth-context,password,crypto,env,rate-limit,webhook-security,with-api,http,errors}.ts`, auth routes | Session organization selection, origin protection, provider signatures, and rate limit gaps identified. | P0-03/04/07, P1-05/06 |
| Data: `prisma/schema.prisma`, `src/lib/db.ts`, `scripts/{seed,bootstrap}.ts` | SQLite prototype schema, no migrations; bootstrap is empty-only. | P0-06, P1-08 |
| Calls/messaging: `src/lib/domain/{calls,messaging}.ts`, webhook routes | Simulation and false success paths identified and blocked in production. | P0-01/02/03 |
| AI: `src/lib/ai/*`, simulator routes, `scripts/simulate-call.ts` | Mock remains development-only; provider history/schema/timeout and retry gaps identified. | P1-02/03, P1-09 |
| Scheduling/jobs: `src/lib/domain/{appointments,service-area}.ts`, `src/lib/rules/*`, `src/lib/worker/outbox.ts`, `scripts/worker.ts` | Booking races, outbox claims, timezone and notice gaps identified. | P1-01/04, P2-02 |
| Dashboard: `src/components/dashboard/*`, `src/lib/api-client.ts`, `src/app/{page,layout,globals.css}`, read routes | Preview claims corrected; role/accessibility and metrics separation need later checks. | P2-01, Phase 5 |
| Tests/docs: `tests/{safety.test.ts,setup.ts}`, `scripts/run-tests.mjs`, `README.md`, `docs/adr/*`, `worklog.md` | Isolated SQLite tests run in CI; historical worklog kept as historical record. | Expand tests with each integration phase |
| Shared controls: `src/components/ui/*`, `src/hooks/*` | Product screens import avatar, badge, button, card, dialog, dropdown menu, input, label, scroll area, sheet, textarea, and toaster. | Phase 5 keyboard/mobile interaction review; unused controls may be trimmed then |

This register is an inventory and finding map. It does not certify the later security, concurrency, provider, or accessibility exit gates.
