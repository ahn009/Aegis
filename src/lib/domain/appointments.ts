import { db } from "../db";
import { env } from "../env";
import { ApiError } from "../errors";
import { audit, auditAsAiTool, auditAsWorker } from "../audit";
import type { BusinessHoursRule, HolidaysRule } from "../rules/schemas";
import { computeAvailability, evalOpenStatus, toZonedParts } from "../rules/evaluators";

// ============================================================================
// Appointment service. SPEC HARD CONSTRAINT:
//   booking protected by (a) transactional overlap re-check AND
//   (b) a DB exclusion constraint (org_id WITH =, tstzrange &&) WHERE status
//   IN ('CONFIRMED','REQUESTED'). A concurrency test must prove exactly one winner.
//
// SQLite has no exclusion constraint and no tstzrange. We enforce:
//   (a) transactional overlap re-check inside a write transaction; SQLite
//       serializes write transactions (database-level write lock) so the
//       re-check is atomic w.r.t. concurrent writers — the second writer's
//       re-check sees the first's committed row and rejects.
//   (b) a defensive guard: a partial unique index equivalent is not possible
//       for ranges in SQLite, so the transactional re-check IS the constraint.
// See docs/adr/0003-booking-concurrency-sqlite.md.
// ============================================================================

export type ApptStatus = "REQUESTED" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NOSHOW";

export interface BookInput {
  organizationId: string;
  contactId?: string;
  leadId?: string;
  callId?: string;
  serviceType: string;
  startIso: string;
  endIso: string;
  notes?: string;
  actorId?: string; // AI tool name or user id
  actorType?: "AI_TOOL" | "USER";
  // the supported-services gate is enforced by the caller (tool executor)
}

export interface BookResult {
  appointment: {
    id: string;
    status: ApptStatus;
    startTime: string;
    endTime: string;
    serviceType: string;
  };
  winner: true;
}

export class BookingConflictError extends Error {
  constructor(public conflictingId?: string) {
    super("Time slot unavailable — double-booking prevented");
    this.name = "BookingConflictError";
  }
}

export class OutOfAreaBookingError extends Error {
  constructor() {
    super("Out-of-area callers cannot book; create a request instead");
    this.name = "OutOfAreaBookingError";
  }
}

/**
 * Book a CONFIRMED appointment with double-booking protection.
 * Throws BookingConflictError on overlap. Exactly one of N concurrent callers wins.
 */
export async function bookAppointment(input: BookInput): Promise<BookResult> {
  const start = new Date(input.startIso);
  const end = new Date(input.endIso);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    throw new ApiError(422, "Invalid appointment window", "VALIDATION");
  }
  if (start < new Date()) {
    throw new ApiError(422, "Cannot book in the past", "VALIDATION");
  }

  // Transactional overlap re-check + insert. SQLite serializes write txns.
  return await db.$transaction(async (tx) => {
    const conflict = await tx.appointment.findFirst({
      where: {
        organizationId: input.organizationId,
        status: { in: ["CONFIRMED", "REQUESTED"] },
        // active REQUESTED holds count: holdUntil is null (CONFIRMED) or in future
        OR: [{ holdUntil: null }, { holdUntil: { gt: new Date() } }],
        startTime: { lt: end },
        endTime: { gt: start },
      },
      select: { id: true },
    });
    if (conflict) {
      throw new BookingConflictError(conflict.id);
    }
    const appt = await tx.appointment.create({
      data: {
        organizationId: input.organizationId,
        contactId: input.contactId ?? null,
        leadId: input.leadId ?? null,
        callId: input.callId ?? null,
        serviceType: input.serviceType,
        startTime: start,
        endTime: end,
        status: "CONFIRMED",
        notes: input.notes ?? null,
      },
    });
    return appt;
  }).then(async (appt) => {
    // Audit (outside tx to avoid blocking)
    await auditAsAiTool(input.organizationId, "book_appointment", {
      action: "APPOINTMENT_CREATE",
      entityType: "Appointment",
      entityId: appt.id,
      after: { status: "CONFIRMED", serviceType: input.serviceType, start: input.startIso, end: input.endIso, contactId: input.contactId },
    });
    // Queue 24h + 2h reminders via outbox (at-least-once)
    await queueReminder(input.organizationId, appt.id, start, 24 * 60);
    await queueReminder(input.organizationId, appt.id, start, 2 * 60);
    return {
      appointment: {
        id: appt.id,
        status: "CONFIRMED" as ApptStatus,
        startTime: appt.startTime.toISOString(),
        endTime: appt.endTime.toISOString(),
        serviceType: appt.serviceType,
      },
      winner: true as const,
    };
  });
}

/**
 * Create an appointment REQUEST with a slot hold (TTL = env.holdTtlMs, default 120 min).
 * Held slots count as busy for the overlap re-check (holdUntil in future).
 */
export async function requestAppointment(input: BookInput & { holdUntil?: Date }): Promise<{ appointment: BookResult["appointment"]; }> {
  const start = new Date(input.startIso);
  const end = input.endIso ? new Date(input.endIso) : new Date(start.getTime() + 60 * 60 * 1000);
  const holdUntil = input.holdUntil ?? new Date(Date.now() + env.holdTtlMs);

  // If a concrete slot is requested, hold it (counts as busy). Otherwise just record.
  if (input.startIso) {
    return await db.$transaction(async (tx) => {
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
        const conflict = await tx.appointment.findFirst({
          where: {
            organizationId: input.organizationId,
            status: { in: ["CONFIRMED", "REQUESTED"] },
            OR: [{ holdUntil: null }, { holdUntil: { gt: new Date() } }],
            startTime: { lt: end },
            endTime: { gt: start },
          },
          select: { id: true },
        });
        if (conflict) throw new BookingConflictError(conflict.id);
      }
      const appt = await tx.appointment.create({
        data: {
          organizationId: input.organizationId,
          contactId: input.contactId ?? null,
          leadId: input.leadId ?? null,
          callId: input.callId ?? null,
          serviceType: input.serviceType,
          startTime: isNaN(start.getTime()) ? new Date() : start,
          endTime: isNaN(end.getTime()) ? new Date(Date.now() + 60 * 60 * 1000) : end,
          status: "REQUESTED",
          holdUntil,
          notes: input.notes ?? null,
        },
      });
      return appt;
    }).then(async (appt) => {
      await auditAsAiTool(input.organizationId, "request_appointment", {
        action: "APPOINTMENT_REQUEST",
        entityType: "Appointment",
        entityId: appt.id,
        after: { status: "REQUESTED", serviceType: input.serviceType, holdUntil: holdUntil.toISOString() },
      });
      // Queue hold-expiry outbox event (worker releases the slot after TTL)
      await db.outboxEvent.create({
        data: {
          organizationId: input.organizationId,
          eventType: "HOLD_EXPIRE",
          payloadJson: JSON.stringify({ appointmentId: appt.id, holdUntil: holdUntil.toISOString() }),
          processAfter: holdUntil,
          idempotencyKey: `hold-expire-${appt.id}`,
        },
      });
      return {
        appointment: {
          id: appt.id,
          status: "REQUESTED" as ApptStatus,
          startTime: appt.startTime.toISOString(),
          endTime: appt.endTime.toISOString(),
          serviceType: appt.serviceType,
        },
      };
    });
  }
  // No concrete slot — just create a REQUEST record
  const appt = await db.appointment.create({
    data: {
      organizationId: input.organizationId,
      contactId: input.contactId ?? null,
      leadId: input.leadId ?? null,
      callId: input.callId ?? null,
      serviceType: input.serviceType,
      startTime: new Date(),
      endTime: new Date(Date.now() + 60 * 60 * 1000),
      status: "REQUESTED",
      holdUntil,
      notes: input.notes ?? null,
    },
  });
  await auditAsAiTool(input.organizationId, "request_appointment", {
    action: "APPOINTMENT_REQUEST",
    entityType: "Appointment",
    entityId: appt.id,
    after: { status: "REQUESTED", serviceType: input.serviceType },
  });
  return {
    appointment: {
      id: appt.id,
      status: "REQUESTED" as ApptStatus,
      startTime: appt.startTime.toISOString(),
      endTime: appt.endTime.toISOString(),
      serviceType: appt.serviceType,
    },
  };
}

/**
 * Release an expired hold. Called by the worker when holdUntil passes.
 * Sets status=CANCELLED so the slot frees for the overlap re-check.
 */
export async function releaseExpiredHold(organizationId: string, appointmentId: string): Promise<void> {
  const appt = await db.appointment.findFirst({ where: { id: appointmentId, organizationId } });
  if (!appt) return;
  if (appt.status !== "REQUESTED") return;
  if (appt.holdUntil && appt.holdUntil > new Date()) return; // not yet expired
  await db.appointment.update({
    where: { id: appointmentId },
    data: { status: "CANCELLED", notes: (appt.notes ?? "") + " [hold expired]" },
  });
  await auditAsWorker(organizationId, "hold-expiry-worker", {
    action: "APPOINTMENT_HOLD_EXPIRED",
    entityType: "Appointment",
    entityId: appointmentId,
    after: { status: "CANCELLED" },
  });
}

// --- Availability ---------------------------------------------------------

export interface AvailabilityInput {
  organizationId: string;
  bh: BusinessHoursRule;
  holidays: HolidaysRule | null;
  fromDate?: Date;
  days?: number;
  slotMinutes?: number;
}

export async function getAvailability(input: AvailabilityInput) {
  const fromDate = input.fromDate ?? new Date();
  const days = input.days ?? 3;
  // Active busy intervals: CONFIRMED + active REQUESTED holds
  const busy = await db.appointment.findMany({
    where: {
      organizationId: input.organizationId,
      status: { in: ["CONFIRMED", "REQUESTED"] },
      OR: [{ holdUntil: null }, { holdUntil: { gt: new Date() } }],
      endTime: { gt: new Date(fromDate.getTime() - 24 * 60 * 60 * 1000) },
    },
    select: { startTime: true, endTime: true },
  });
  const slots = computeAvailability(input.bh, input.holidays, busy.map((b) => ({ start: b.startTime, end: b.endTime })), {
    fromDate,
    days,
    slotMinutes: input.slotMinutes ?? 60,
  });
  return { slots, count: slots.length, timezone: input.bh.timezone };
}

// --- Reminders (outbox) ---------------------------------------------------

async function queueReminder(organizationId: string, appointmentId: string, startUtc: Date, minutesBefore: number) {
  const sendAt = new Date(startUtc.getTime() - minutesBefore * 60 * 1000);
  if (sendAt <= new Date()) return; // skip past reminders
  await db.outboxEvent.create({
    data: {
      organizationId,
      eventType: minutesBefore >= 60 ? `REMINDER_${Math.floor(minutesBefore / 60)}H` : "REMINDER_2H",
      payloadJson: JSON.stringify({ appointmentId, minutesBefore, sendAt: sendAt.toISOString() }),
      processAfter: sendAt,
      idempotencyKey: `reminder-${appointmentId}-${minutesBefore}`,
    },
  });
}

// --- Confirmation / cancellation -----------------------------------------

export async function confirmAppointment(organizationId: string, appointmentId: string, actorId?: string, actorType: "AI_TOOL" | "USER" = "AI_TOOL"): Promise<void> {
  const appt = await db.appointment.findFirst({ where: { id: appointmentId, organizationId } });
  if (!appt) throw new ApiError(404, "Appointment not found");
  if (appt.status !== "REQUESTED") throw new ApiError(409, "Only REQUESTED appointments can be confirmed");
  // Re-check overlap before confirming (the hold occupies the slot; confirming keeps it)
  const conflict = await db.appointment.findFirst({
    where: {
      organizationId,
      id: { not: appointmentId },
      status: "CONFIRMED",
      startTime: { lt: appt.endTime },
      endTime: { gt: appt.startTime },
    },
  });
  if (conflict) throw new BookingConflictError(conflict.id);
  await db.appointment.update({ where: { id: appointmentId }, data: { status: "CONFIRMED", holdUntil: null } });
  await audit({
    organizationId,
    actorType,
    actorId: actorId ?? (actorType === "AI_TOOL" ? "confirm_appointment" : undefined),
    action: "APPOINTMENT_CONFIRM",
    entityType: "Appointment",
    entityId: appointmentId,
    after: { status: "CONFIRMED" },
  });
}

export async function cancelAppointment(organizationId: string, appointmentId: string, reason: string, actorId?: string, actorType: "AI_TOOL" | "USER" = "AI_TOOL"): Promise<void> {
  const appt = await db.appointment.findFirst({ where: { id: appointmentId, organizationId } });
  if (!appt) throw new ApiError(404, "Appointment not found");
  await db.appointment.update({ where: { id: appointmentId }, data: { status: "CANCELLED", notes: (appt.notes ?? "") + ` [cancelled: ${reason}]` } });
  await audit({
    organizationId,
    actorType,
    actorId: actorId ?? (actorType === "AI_TOOL" ? "cancel_appointment" : undefined),
    action: "APPOINTMENT_CANCEL",
    entityType: "Appointment",
    entityId: appointmentId,
    after: { status: "CANCELLED", reason },
  });
}

// Re-export open status helper for the orchestrator
export { evalOpenStatus, toZonedParts };
