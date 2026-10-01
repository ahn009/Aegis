import { db } from "../db";
import { auditAsWorker } from "../audit";
import { normalizePhone, isValidE164 } from "../phone";
import { ApiError } from "../errors";
import type { Prisma } from "@prisma/client";
import { redactPii } from "../audit";

// ============================================================================
// SMS messaging service. SPEC HARD CONSTRAINT:
//   STOP/UNSUBSCRIBE → immediate org-scoped suppression enforced in the SENDER
//   SERVICE (not in templates). Missed-call text-back only in permitted hours,
//   once per CallSid.
// ============================================================================

const STOP_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
const START_KEYWORDS = ["START", "YES", "UNSTOP"];

/** Inbound SMS handler. Detects STOP/START and toggles suppression. */
export async function handleInboundSms(organizationId: string, fromPhone: string, body: string, client: Prisma.TransactionClient = db): Promise<{ suppressed: boolean; replied: boolean }> {
  const phone = normalizePhone(fromPhone);
  if (!phone || !isValidE164(phone)) return { suppressed: false, replied: false };
  const upper = body.trim().toUpperCase();
  // Persist inbound
  await client.smsMessage.create({
    data: { organizationId, toPhone: phone, fromPhone: phone, body, direction: "INBOUND", status: "DELIVERED" },
  });

  if (STOP_KEYWORDS.includes(upper)) {
    // Immediate org-scoped suppression
    await client.smsOptOut.upsert({
      where: { organizationId_phoneE164: { organizationId, phoneE164: phone } },
      create: { organizationId, phoneE164: phone, reason: "STOP" },
      update: { reason: "STOP" },
    });
    await auditSms(organizationId, "sms-inbound", {
      action: "SMS_OPT_OUT",
      entityType: "SmsOptOut",
      entityId: phone,
      after: { phoneE164: phone, reason: "STOP" },
    }, client);
    // Auto-acknowledge per carrier best practices
    await sendSmsInternal(organizationId, phone, "You have been unsubscribed. Reply START to opt back in.", "OPTOUT_ACK", client);
    return { suppressed: true, replied: true };
  }
  if (START_KEYWORDS.includes(upper)) {
    await client.smsOptOut.deleteMany({ where: { organizationId, phoneE164: phone } });
    await auditSms(organizationId, "sms-inbound", {
      action: "SMS_OPT_IN",
      entityType: "SmsOptOut",
      entityId: phone,
      after: { phoneE164: phone, optIn: true },
    }, client);
    await sendSmsInternal(organizationId, phone, "You have been re-subscribed. Reply STOP to opt out.", "OPTIN_ACK", client);
    return { suppressed: false, replied: true };
  }
  return { suppressed: false, replied: false };
}

/** Returns true if the recipient is suppressed (opted out) for this org. */
export async function isSuppressed(organizationId: string, phoneE164: string): Promise<boolean> {
  const phone = normalizePhone(phoneE164);
  if (!phone) return false;
  const opt = await db.smsOptOut.findUnique({
    where: { organizationId_phoneE164: { organizationId, phoneE164: phone } },
  });
  return !!opt;
}

/**
 * Send an SMS. The SENDER SERVICE enforces the opt-out gate — callers cannot
 * bypass it. Returns status STOPPED if suppressed (never silently sends).
 */
export async function sendSms(
  organizationId: string,
  toPhone: string,
  body: string,
  templateKey?: string,
): Promise<{ status: "SENT" | "STOPPED" | "FAILED"; messageId?: string }> {
  const phone = normalizePhone(toPhone);
  if (!phone || !isValidE164(phone)) {
    throw new ApiError(422, "Invalid phone", "VALIDATION");
  }
  if (process.env.NODE_ENV === "production") {
    throw new ApiError(503, "SMS provider is not configured", "SERVICE_UNAVAILABLE");
  }
  // SENDER-LEVEL GATE — enforced here, not in templates.
  if (await isSuppressed(organizationId, phone)) {
    const msg = await db.smsMessage.create({
      data: { organizationId, toPhone: phone, fromPhone: null, body, direction: "OUTBOUND", templateKey, status: "STOPPED" },
    });
    await auditAsWorker(organizationId, "sms-sender", {
      action: "SMS_SUPPRESSED",
      entityType: "SmsMessage",
      entityId: msg.id,
      after: { toPhone: phone, templateKey, reason: "OPT_OUT" },
    });
    return { status: "STOPPED", messageId: msg.id };
  }
  return sendSmsInternal(organizationId, phone, body, templateKey);
}

async function sendSmsInternal(organizationId: string, phone: string, body: string, templateKey?: string, client: Prisma.TransactionClient = db) {
  if (process.env.NODE_ENV === "production") {
    throw new ApiError(503, "SMS provider is not configured", "SERVICE_UNAVAILABLE");
  }
  // Real Twilio call would go here. In this build (no Twilio creds), we record
  // the message as SENT. The outbox + worker pattern would retry on failure.
  const msg = await client.smsMessage.create({
    data: { organizationId, toPhone: phone, fromPhone: null, body, direction: "OUTBOUND", templateKey, status: "SENT" },
  });
  await auditSms(organizationId, "sms-sender", {
    action: "SMS_SEND",
    entityType: "SmsMessage",
    entityId: msg.id,
    after: { toPhone: phone, templateKey, status: "SENT" },
  }, client);
  return { status: "SENT" as const, messageId: msg.id };
}

async function auditSms(
  organizationId: string,
  actorId: string,
  input: { action: string; entityType: string; entityId: string; after: unknown },
  client: Prisma.TransactionClient,
) {
  if (client === db) return auditAsWorker(organizationId, actorId, input);
  await client.auditLog.create({ data: {
    organizationId, actorType: "WORKER", actorId,
    action: input.action, entityType: input.entityType, entityId: input.entityId,
    afterJson: JSON.stringify(redactPii(input.after)),
  } });
}

/**
 * Missed-call text-back. SPEC: only in permitted hours, once per CallSid,
 * and capped 1 per caller per 4h (enforced via MissedCallRecovery windowKey
 * unique constraint).
 */
export async function sendMissedCallTextBack(
  organizationId: string,
  callSid: string,
  callId: string,
  fromPhone: string,
  template: string,
  permittedHours: { start: number; end: number },
  orgTz: string,
): Promise<{ sent: boolean; reason?: string }> {
  const phone = normalizePhone(fromPhone);
  if (!phone) return { sent: false, reason: "invalid_phone" };
  // Permitted-hours check in org timezone
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: orgTz, hour: "numeric", hour12: false });
  const hourStr = fmt.format(now);
  const hour = parseInt(hourStr, 10);
  const inWindow = hour >= permittedHours.start && hour < permittedHours.end;
  if (!inWindow) return { sent: false, reason: "outside_permitted_hours" };

  // 1 per caller per 4h via unique windowKey
  const windowKey = `${phone}#${Math.floor(now.getTime() / (4 * 60 * 60 * 1000))}`;
  try {
    await db.missedCallRecovery.create({
      data: {
        organizationId,
        callId,
        callSid,
        phoneE164: phone,
        windowKey,
        textBackSent: false,
        leadCreated: false,
      },
    });
  } catch {
    // Unique constraint violation → already recovered in this window
    return { sent: false, reason: "already_recovered_in_window" };
  }
  // Suppression gate (sender-level)
  const res = await sendSms(organizationId, phone, template, "MISSED_CALL_TEXTBACK");
  if (res.status === "STOPPED") return { sent: false, reason: "suppressed" };
  if (res.status === "FAILED") return { sent: false, reason: "send_failed" };
  // Mark recovery
  await db.missedCallRecovery.updateMany({
    where: { callId },
    data: { textBackSent: true },
  });
  return { sent: true };
}
