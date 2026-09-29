import type { ToolContext, ToolResult, SideEffect } from "./types";
import { TOOL_ARG_SCHEMAS } from "./tool-schemas";
import { resolveServiceArea, resolveTransferTarget, resolveOpenStatus } from "../domain/service-area";
import { getAvailability, bookAppointment, requestAppointment, BookingConflictError } from "../domain/appointments";
import { upsertContactByPhone } from "../domain/contacts";
import { createLead } from "../domain/leads";
import { sendSms } from "../domain/messaging";
import { audit } from "../audit";
import type { RuleContext } from "../rules/engine";
import { db } from "../db";
import { ApiError } from "../errors";

// ============================================================================
// Tool executor. SPEC HARD CONSTRAINT:
//   Tool calls: Zod-validated args, org context injected server-side, executed
//   by domain services. Invalid args → ONE repair round → safe fallback +
//   escalation. Log every attempt.
// The AI may never: invent pricing/availability, diagnose, invent transfer
// numbers, alter urgency logic, touch contact org/id/CRM links, or accept
// services outside the org's configured list.
// ============================================================================

export interface ToolExecutionAttempt {
  tool: string;
  args: unknown;
  validationOk: boolean;
  validationErrors?: unknown;
  executionOk: boolean;
  result?: unknown;
  error?: string;
  repaired: boolean;
  sideEffects: SideEffect[];
}

export interface ExecContext extends ToolContext {
  rules: RuleContext;
  org: { transferPhone?: string | null; voicemailPhone?: string | null; name: string; timezone: string };
  callId?: string;
  conversationId?: string;
}

export async function executeTool(
  name: string,
  rawArgs: unknown,
  ctx: ExecContext,
): Promise<ToolExecutionAttempt> {
  const schema = TOOL_ARG_SCHEMAS[name as keyof typeof TOOL_ARG_SCHEMAS];
  if (!schema) {
    return logAttempt(ctx, { tool: name, args: rawArgs, validationOk: false, validationErrors: "unknown tool", executionOk: false, error: "unknown tool", repaired: false, sideEffects: [] });
  }
  // 1. Zod validation
  const parsed = schema.safeParse(rawArgs);
  if (!parsed.success) {
    return logAttempt(ctx, {
      tool: name,
      args: rawArgs,
      validationOk: false,
      validationErrors: parsed.error.issues,
      executionOk: false,
      error: "validation_failed",
      repaired: false,
      sideEffects: [],
    });
  }
  const args = parsed.data;
  // 2. Execute via domain service (org context injected server-side)
  try {
    const result = await dispatch(name, args, ctx);
    // executionOk reflects the tool's business outcome (result.ok), not just
    // whether dispatch ran without throwing. e.g. out-of-area → executionOk:false.
    return { tool: name, args: rawArgs, validationOk: true, executionOk: result.ok, result, repaired: false, sideEffects: result.sideEffects ?? [] };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return logAttempt(ctx, {
      tool: name,
      args: rawArgs,
      validationOk: true,
      executionOk: false,
      error,
      repaired: false,
      sideEffects: [],
    });
  }
}

async function dispatch(name: string, args: any, ctx: ExecContext): Promise<ToolResult & { sideEffects?: SideEffect[] }> {
  switch (name) {
    case "check_service_area": {
      const serviceArea = ctx.rules.rules.service_area;
      const res = resolveServiceArea(serviceArea, { zip: args.zip, city: args.city, state: args.state });
      return { ok: true, data: res };
    }
    case "get_availability": {
      const bh = ctx.rules.rules.business_hours;
      const holidays = ctx.rules.rules.holidays;
      if (!bh) return { ok: false, error: "business_hours rule not configured" };
      const fromDate = args.fromDate ? new Date(args.fromDate) : new Date();
      const res = await getAvailability({
        organizationId: ctx.organizationId,
        bh: bh.data,
        holidays: holidays?.data ?? null,
        fromDate,
        days: args.days,
        slotMinutes: args.slotMinutes,
      });
      return { ok: true, data: res };
    }
    case "book_appointment": {
      // SERVICE GATE: reject services outside the org's configured list
      if (!ctx.supportedServices.includes(args.serviceType)) {
        return { ok: false, error: `unsupported_service: ${args.serviceType}. Allowed: ${ctx.supportedServices.join(", ")}` };
      }
      // AREA GATE: re-derive inArea deterministically — never trust AI
      const serviceArea = ctx.rules.rules.service_area;
      const areaRes = resolveServiceArea(serviceArea, { zip: args.serviceAddressZip });
      if (!areaRes.inArea) {
        // SPEC: out-of-area never books. Return error; orchestrator offers request.
        return { ok: false, error: "out_of_area: caller is outside the service area; use request_appointment instead" };
      }
      // Upsert contact first (so booking links to it)
      let contactId: string | undefined;
      if (args.callbackNumber) {
        const c = await upsertContactByPhone({
          organizationId: ctx.organizationId,
          phoneE164: args.callbackNumber,
          name: args.contactName ?? null,
          addressZip: args.serviceAddressZip ?? null,
        });
        contactId = c.id;
      }
      try {
        const res = await bookAppointment({
          organizationId: ctx.organizationId,
          contactId,
          callId: ctx.callId,
          serviceType: args.serviceType,
          startIso: args.startIso,
          endIso: args.endIso,
          notes: args.notes,
          actorType: "AI_TOOL",
        });
        return {
          ok: true,
          data: { appointment: res.appointment, contactId },
          sideEffects: [{ kind: "APPOINTMENT_BOOKED", ref: { entityType: "Appointment", entityId: res.appointment.id } }],
        };
      } catch (e) {
        if (e instanceof BookingConflictError) {
          return { ok: false, error: "booking_conflict: that slot was just taken. Please offer another slot." };
        }
        throw e;
      }
    }
    case "request_appointment": {
      if (!ctx.supportedServices.includes(args.serviceType)) {
        return { ok: false, error: `unsupported_service: ${args.serviceType}` };
      }
      let contactId: string | undefined;
      if (args.callbackNumber) {
        const c = await upsertContactByPhone({
          organizationId: ctx.organizationId,
          phoneE164: args.callbackNumber,
          name: args.contactName ?? null,
          addressZip: args.serviceAddressZip ?? null,
        });
        contactId = c.id;
      }
      const res = await requestAppointment({
        organizationId: ctx.organizationId,
        contactId,
        callId: ctx.callId,
        serviceType: args.serviceType,
        startIso: args.startIso,
        endIso: args.endIso,
        notes: args.notes,
        actorType: "AI_TOOL",
      });
      return {
        ok: true,
        data: { appointment: res.appointment, contactId },
        sideEffects: [{ kind: "APPOINTMENT_REQUESTED", ref: { entityType: "Appointment", entityId: res.appointment.id } }],
      };
    }
    case "create_or_update_contact": {
      const res = await upsertContactByPhone({
        organizationId: ctx.organizationId,
        phoneE164: args.callbackNumber,
        name: args.name ?? null,
        email: args.email ?? null,
        addressStreet: args.addressStreet ?? null,
        addressCity: args.addressCity ?? null,
        addressState: args.addressState ?? null,
        addressZip: args.addressZip ?? null,
      });
      return {
        ok: true,
        data: { contactId: res.id, created: res.created },
        sideEffects: [{ kind: "CONTACT_UPSERT", ref: { entityType: "Contact", entityId: res.id } }],
      };
    }
    case "create_lead": {
      // Re-derive inServiceArea deterministically — AI may not set it
      const serviceArea = ctx.rules.rules.service_area;
      const areaRes = args.serviceAddressZip
        ? resolveServiceArea(serviceArea, { zip: args.serviceAddressZip })
        : { inArea: undefined, allowRequestOnly: true };
      const lead = await createLead({
        organizationId: ctx.organizationId,
        phoneE164: args.phone,
        name: args.name ?? null,
        serviceType: args.serviceType ?? null,
        serviceAddressZip: args.serviceAddressZip ?? null,
        urgency: args.urgency,
        inServiceArea: areaRes.inArea,
        source: args.source,
        notes: args.notes,
      });
      return {
        ok: true,
        data: { leadId: lead.id, inServiceArea: areaRes.inArea },
        sideEffects: [{ kind: "LEAD_CREATE", ref: { entityType: "Lead", entityId: lead.id } }],
      };
    }
    case "transfer_to_human": {
      if (process.env.NODE_ENV === "production") {
        return { ok: false, error: "transfer_unavailable: voice provider is not configured", sideEffects: [] };
      }
      // Target phone NEVER from AI — resolved from rules.
      const escalation = ctx.rules.rules.escalation_routing;
      const afterHours = ctx.rules.rules.after_hours;
      const target = resolveTransferTarget(escalation, afterHours, { transferPhone: ctx.org.transferPhone, voicemailPhone: ctx.org.voicemailPhone }, args.reason);
      if (!target.phone) {
        // No transfer target → voicemail + staff notification + follow-up record
        // SPEC: never promise a callback without a created follow-up.
        await db.outboxEvent.create({
          data: {
            organizationId: ctx.organizationId,
            eventType: "STAFF_NOTIFY",
            payloadJson: JSON.stringify({ reason: args.reason, target: "unreachable", staffNotifyEmail: target.staffNotifyEmail }),
            idempotencyKey: `transfer-fail-${ctx.callId ?? "n/a"}-${Date.now()}`,
          },
        });
        return {
          ok: false,
          error: "transfer_unreachable: no transfer target configured; routing to voicemail and notifying staff. A follow-up has been created.",
          sideEffects: [{ kind: "VOICEMAIL" }],
        };
      }
      // Audit the transfer
      await audit({
        organizationId: ctx.organizationId,
        actorType: "AI_TOOL",
        actorId: "transfer_to_human",
        action: "CALL_TRANSFER",
        entityType: "Call",
        entityId: ctx.callId,
        after: { reason: args.reason, targetPhone: "[REDACTED]" },
      });
      return {
        ok: true,
        data: { transferred: true, reason: args.reason },
        sideEffects: [{ kind: "TRANSFER" }],
      };
    }
    default:
      return { ok: false, error: `unknown tool: ${name}` };
  }
}

async function logAttempt(ctx: ExecContext, attempt: ToolExecutionAttempt): Promise<ToolExecutionAttempt> {
  await audit({
    organizationId: ctx.organizationId,
    actorType: "AI_TOOL",
    actorId: attempt.tool,
    action: attempt.validationOk ? "AI_TOOL_EXEC" : "AI_TOOL_VALIDATION_FAIL",
    entityType: "ToolCall",
    entityId: ctx.conversationId,
    after: { tool: attempt.tool, validationOk: attempt.validationOk, executionOk: attempt.executionOk, error: attempt.error, args: attempt.args },
  }).catch(() => {});
  return attempt;
}
