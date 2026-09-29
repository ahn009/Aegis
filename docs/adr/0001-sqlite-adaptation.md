# ADR 0001 — SQLite instead of PostgreSQL 16

Date: 2026-09-29 · Status: Accepted

## Context
The SPEC mandates PostgreSQL 16 with ordered SQL migrations, a `tstzrange` exclusion
constraint for booking overlap, and Postgres FTS for knowledge retrieval. The deployment
environment for this build is locked to **Next.js 16 + Prisma (SQLite)** — there is no
Postgres instance available, and only port 3000 is exposed.

## Decision
Adapt the data layer to SQLite via Prisma, preserving every HARD CONSTRAINT:

- All domain tables carry `organization_id`; every query filters by it from session/job
  payload, never client input. (Unchanged.)
- Timestamps are stored as ISO-8601 UTC strings (`DateTime` → SQLite TEXT). Overlap math
  is done in JS against `Date` objects, not via `tstzrange`.
- The Postgres **exclusion constraint** is replaced by a transactional overlap re-check
  inside a write transaction (see ADR 0003). SQLite serializes write transactions at the
  database level, so the re-check is atomic w.r.t. concurrent writers — exactly-one-winner
  semantics are preserved and proven by the concurrency test.
- Postgres **FTS** is replaced by SQLite `LIKE` filtering for knowledge-document
  retrieval. The PUBLISHED-only retrieval gate is enforced in the service layer.
- Raw SQL migrations are replaced by `prisma db push` (dev) / `prisma migrate` (prod).
  The schema is the single source of truth in `prisma/schema.prisma`.

## Consequences
- No native range type or exclusion constraint; booking safety relies on the transactional
  re-check + SQLite's serialized writes. This is safe for single-node deployments.
- No FTS ranking; knowledge search is substring-based. Acceptable for the documented scope.
- All other HARD CONSTRAINTS (tenancy, audit, opt-out, emergency) are implemented identically.
