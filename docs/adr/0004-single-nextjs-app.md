# ADR 0004 — Single Next.js app instead of the SPEC monorepo

Date: 2026-09-29 · Status: Accepted

## Context
The SPEC prescribes an ESM npm-workspaces monorepo with separate apps:
`apps/api` (Fastify), `apps/voice-gateway` (Twilio webhooks), `apps/worker` (BullMQ),
`apps/dashboard` (React + Vite), plus `packages/*`. The deployment environment is a single
**Next.js 16** application exposing only the `/` route, on port 3000, with SQLite.

## Decision
Collapse the monorepo into one Next.js App Router app, preserving the architectural thesis
and package boundaries as **directory modules**:

| SPEC package/app        | This build                                           |
|------------------------|------------------------------------------------------|
| `apps/api` (Fastify)   | `src/app/api/*` route handlers (Zod-validated)       |
| `apps/voice-gateway`   | `src/app/api/webhooks/*` + `src/lib/domain/calls.ts` |
| `apps/worker` (BullMQ) | `src/lib/worker/outbox.ts` + `scripts/worker.ts` (polling) + `POST /api/worker/run` |
| `apps/dashboard` (Vite)| `src/app/page.tsx` + `src/components/dashboard/*`    |
| `packages/domain`      | `src/lib/domain/*` + `src/lib/db.ts`                 |
| `packages/business-rules` | `src/lib/rules/*`                                 |
| `packages/ai`          | `src/lib/ai/*`                                       |
| `packages/messaging`   | `src/lib/domain/messaging.ts`                        |
| `packages/knowledge`   | `src/lib/domain/knowledge.ts` (interface)            |

The architectural thesis ("AI interprets; deterministic software controls") is preserved
exactly: the AI never owns data, authorization, pricing, availability, urgency, transfer
numbers, or contact org/id/CRM links. Every consequential action runs in a validated
domain service with server-side org context.

## Consequences
- One process, one port, one deployable — fits the environment.
- The worker is an in-process polling loop (or a standalone `bun run worker` script)
  instead of a separate BullMQ consumer. At-least-once + idempotency keys are preserved.
- The voice gateway is simulated via API routes returning JSON-TwiML; real Twilio
  signature verification is implemented (`src/lib/webhook-security.ts`) and gated behind
  `VELORA_VERIFY_WEBHOOKS=1`.
- `scripts/simulate-call.ts` drives the full conversation with zero external accounts.
