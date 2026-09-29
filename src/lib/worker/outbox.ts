import { db } from "../db";
import { releaseExpiredHold } from "../domain/appointments";
import { sendSms } from "../domain/messaging";
import { auditAsWorker } from "../audit";

// ============================================================================
// Outbox worker. SPEC §11: idempotency keys on external side effects, retry
// with backoff, outbox pattern, reconciliation jobs. At-least-once delivery;
// consumers must be idempotent (idempotencyKey dedupes).
//
// In this build the worker runs either via `bun run worker` (scripts/worker.ts,
// a polling loop) or via POST /api/worker/run (dashboard trigger). Both call
// processOutbox() below.
// ============================================================================

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30_000;

export interface WorkerRunResult {
  processed: number;
  succeeded: number;
  failed: number;
  deadLettered: number;
  byEventType: Record<string, number>;
}

export async function processOutbox(maxItems = 50): Promise<WorkerRunResult> {
  const result: WorkerRunResult = { processed: 0, succeeded: 0, failed: 0, deadLettered: 0, byEventType: {} };
  const now = new Date();
  // Claim a batch of due, pending/processing-stale events.
  const due = await db.outboxEvent.findMany({
    where: {
      status: { in: ["PENDING", "PROCESSING"] },
      processAfter: { lte: now },
    },
    orderBy: { processAfter: "asc" },
    take: maxItems,
  });

  for (const ev of due) {
    result.processed++;
    result.byEventType[ev.eventType] = (result.byEventType[ev.eventType] ?? 0) + 1;
    try {
      // Idempotency: check if already processed by key
      if (ev.idempotencyKey) {
        const done = await db.outboxEvent.findFirst({
          where: { idempotencyKey: ev.idempotencyKey, status: "DONE", id: { not: ev.id } },
        });
        if (done) {
          await db.outboxEvent.update({ where: { id: ev.id }, data: { status: "DONE", processedAt: now } });
          result.succeeded++;
          continue;
        }
      }
      await db.outboxEvent.update({ where: { id: ev.id }, data: { status: "PROCESSING" } });
      await dispatch(ev.eventType, ev.payloadJson, ev.organizationId);
      await db.outboxEvent.update({ where: { id: ev.id }, data: { status: "DONE", processedAt: now, attempts: ev.attempts + 1 } });
      result.succeeded++;
    } catch (e) {
      const attempts = ev.attempts + 1;
      const lastError = e instanceof Error ? e.message : String(e);
      const dead = attempts >= MAX_ATTEMPTS;
      await db.outboxEvent.update({
        where: { id: ev.id },
        data: {
          status: dead ? "DEAD" : "PENDING",
          attempts,
          lastError,
          processAfter: new Date(now.getTime() + BASE_BACKOFF_MS * Math.pow(2, attempts - 1)),
        },
      });
      if (dead) result.deadLettered++;
      else result.failed++;
      await auditAsWorker(ev.organizationId, "outbox-worker", {
        action: "OUTBOX_RETRY",
        entityType: "OutboxEvent",
        entityId: ev.id,
        after: { eventType: ev.eventType, attempts, lastError, dead },
      }).catch(() => {});
    }
  }
  return result;
}

async function dispatch(eventType: string, payloadJson: string, organizationId: string): Promise<void> {
  const payload = JSON.parse(payloadJson);
  switch (eventType) {
    case "HOLD_EXPIRE": {
      await releaseExpiredHold(organizationId, payload.appointmentId);
      return;
    }
    case "REMINDER_24H":
    case "REMINDER_2H": {
      const appt = await db.appointment.findFirst({ where: { id: payload.appointmentId, organizationId } });
      if (!appt || appt.status === "CANCELLED") return; // idempotent skip
      const contact = appt.contactId ? await db.contact.findUnique({ where: { id: appt.contactId } }) : null;
      if (!contact) return;
      const when = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Chicago" }).format(appt.startTime);
      const hours = eventType === "REMINDER_24H" ? "tomorrow" : "soon";
      await sendSms(organizationId, contact.phoneE164, `Reminder: your ${appt.serviceType.replace(/_/g, " ").toLowerCase()} appointment is ${hours} (${when}). Reply STOP to opt out.`, eventType);
      return;
    }
    case "STAFF_NOTIFY": {
      await auditAsWorker(organizationId, "outbox-worker", {
        action: "STAFF_NOTIFY",
        entityType: "Notification",
        after: payload,
      });
      return;
    }
    case "RECONCILE": {
      const past = await db.appointment.findMany({
        where: { organizationId, status: "CONFIRMED", endTime: { lt: new Date() } },
        select: { id: true },
      });
      for (const a of past) {
        await db.appointment.update({ where: { id: a.id }, data: { status: "COMPLETED" } }).catch(() => {});
      }
      return;
    }
    default:
      console.warn("[worker] unknown event type:", eventType);
  }
}
