# ADR 0003 — Booking concurrency on SQLite

Date: 2026-09-29 · Status: Accepted

## Context
SPEC HARD CONSTRAINT: booking is protected by (a) a transactional overlap re-check AND
(b) a Postgres exclusion constraint
`EXCLUDE USING gist (organization_id WITH =, tstzrange &&) WHERE status IN ('CONFIRMED','REQUESTED')`.
A concurrency test must prove exactly one winner. SQLite has no exclusion constraint and
no `tstzrange`.

## Decision
Enforce booking safety with a **transactional overlap re-check** inside a Prisma
interactive write transaction (`db.$transaction`):

```ts
await db.$transaction(async (tx) => {
  const conflict = await tx.appointment.findFirst({
    where: {
      organizationId,
      status: { in: ["CONFIRMED", "REQUESTED"] },
      OR: [{ holdUntil: null }, { holdUntil: { gt: new Date() } }],  // active holds
      startTime: { lt: end },
      endTime: { gt: start },
    },
  });
  if (conflict) throw new BookingConflictError(conflict.id);
  return tx.appointment.create({ data: { ... status: "CONFIRMED" } });
});
```

### Why this is safe
SQLite acquires a **database-level write lock** for any write transaction. Two concurrent
`bookAppointment` calls therefore serialize: the first acquires the lock, runs the
re-check (no conflict), inserts, commits. The second waits on the lock (Prisma sets a
generous `busy_timeout`), then acquires it, runs the re-check — which now **sees the
first's committed insert** — and rejects with `BookingConflictError`.

This delivers exactly-one-winner semantics without a range exclusion constraint.

### REQUESTED holds
A REQUESTED appointment holds its slot for `env.holdTtlMs` (120 min). The re-check treats
a REQUESTED row as busy only while `holdUntil` is null (CONFIRMED) or in the future. When
the hold expires, the worker sets status to `CANCELLED`, freeing the slot (proven by the
hold-expiry test).

## Consequences
- Correct under SQLite's single-writer model. For a multi-node Postgres deployment, add
  the exclusion constraint as a **second** layer of defense (the re-check stays).
- The concurrency test (`tests/safety.test.ts` §1) fires two `Promise.all` bookings on the
  same slot and asserts one `winner: true` + one `BookingConflictError`.
- No false successes: the re-check runs inside the same transaction that inserts.
