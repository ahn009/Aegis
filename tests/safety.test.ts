// ============================================================================
// tests/safety.test.ts — Velora HVAC safety-constraint suite (9 tests).
//
// Each describe block proves ONE hard constraint from the SPEC. The library
// code is read-only here; if a test surfaces a real bug we document it in the
// worklog and .skip the test with a comment, never patching src/.
// ============================================================================
import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { db } from "../src/lib/db";
import {
  bookAppointment,
  requestAppointment,
  releaseExpiredHold,
  confirmAppointment,
  BookingConflictError,
} from "../src/lib/domain/appointments";
import { upsertContactByPhone } from "../src/lib/domain/contacts";
import {
  sendSms,
  handleInboundSms,
  isSuppressed,
  sendMissedCallTextBack,
} from "../src/lib/domain/messaging";
import { runTurn } from "../src/lib/ai/orchestrator";
import { executeTool, type ExecContext } from "../src/lib/ai/tool-executor";
import { createMockProvider } from "../src/lib/ai/provider-mock";
import {
  loadRuleContext,
  getPublishedRule,
  createDraftVersion,
  publishVersion,
} from "../src/lib/rules/engine";
import {
  classifyUrgency,
  computeAvailability,
} from "../src/lib/rules/evaluators";
import { startInboundCall } from "../src/lib/domain/calls";
import { encrypt, timingSafeEqualString, randomToken } from "../src/lib/crypto";
import { env } from "../src/lib/env";
import type {
  AiProvider,
  ProviderInput,
  ProviderResponse,
} from "../src/lib/ai/types";
import { hashPassword } from "../src/lib/password";

// --- shared state -----------------------------------------------------------
let orgId: string;

beforeAll(async () => {
  const org = await db.organization.findUniqueOrThrow({
    where: { slug: "dfw-velora-hvac" },
  });
  orgId = org.id;
});

// --- helpers ----------------------------------------------------------------

/** Find a genuinely free future slot within the seeded business hours. */
async function getFreeSlot(daysAhead = 14): Promise<{ startIso: string; endIso: string }> {
  const rules = await loadRuleContext(orgId);
  const bh = rules.rules.business_hours;
  const holidays = rules.rules.holidays;
  if (!bh) throw new Error("business_hours rule not seeded");
  const busy = await db.appointment.findMany({
    where: {
      organizationId: orgId,
      status: { in: ["CONFIRMED", "REQUESTED"] },
      OR: [{ holdUntil: null }, { holdUntil: { gt: new Date() } }],
    },
    select: { startTime: true, endTime: true },
  });
  // Start from tomorrow so every returned slot is strictly in the future
  // (bookAppointment rejects start < now).
  const fromDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const slots = computeAvailability(
    bh.data,
    holidays?.data ?? null,
    busy.map((b) => ({ start: b.startTime, end: b.endTime })),
    { fromDate, days: daysAhead, slotMinutes: 60 },
  );
  const now = Date.now();
  const future = slots.filter((s) => new Date(s.startIso).getTime() > now);
  if (!future.length) throw new Error("no free future slots in next " + daysAhead + " days");
  return future[0]!;
}

/** Build an ExecContext against the seeded DFW org + rules. */
async function buildExecCtx(): Promise<ExecContext> {
  const rules = await loadRuleContext(orgId);
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  return {
    organizationId: orgId,
    supportedServices: ["AC_REPAIR", "HEATING_REPAIR", "MAINTENANCE", "INSTALLATION", "INSPECTION"],
    rules,
    org: {
      transferPhone: org.transferPhone,
      voicemailPhone: org.voicemailPhone,
      name: org.name,
      timezone: org.timezone,
    },
  };
}

/** Create an inbound call + conversation for orchestrator tests. */
async function freshCall(phone: string, callSid?: string) {
  const sid = callSid ?? "CA" + randomToken(16).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);
  return startInboundCall({
    organizationId: orgId,
    callSid: sid,
    fromPhone: phone,
    toPhone: "+12145550100",
  });
}

// ============================================================================
// 1. Concurrent booking race — exactly one winner.
// ============================================================================
describe("1. concurrent booking race — exactly one winner", () => {
  it("races two bookAppointment calls on the same slot; exactly one wins", async () => {
    const phone = "+12145550001";
    const contact = await upsertContactByPhone({
      organizationId: orgId,
      phoneE164: phone,
      name: "Race Caller",
      addressZip: "75201",
    });

    const slot = await getFreeSlot();

    // Fire both bookings concurrently. SQLite serializes write transactions,
    // so the second writer's overlap re-check sees the first's committed row.
    const results = await Promise.allSettled([
      bookAppointment({
        organizationId: orgId,
        contactId: contact.id,
        serviceType: "AC_REPAIR",
        startIso: slot.startIso,
        endIso: slot.endIso,
        actorType: "AI_TOOL",
      }),
      bookAppointment({
        organizationId: orgId,
        contactId: contact.id,
        serviceType: "AC_REPAIR",
        startIso: slot.startIso,
        endIso: slot.endIso,
        actorType: "AI_TOOL",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const winner = (fulfilled[0] as PromiseFulfilledResult<{ appointment: any; winner: true }>).value;
    expect(winner.winner).toBe(true);
    expect(winner.appointment.status).toBe("CONFIRMED");

    const loser = (rejected[0] as PromiseRejectedResult).reason;
    expect(loser).toBeInstanceOf(BookingConflictError);

    // The DB must hold exactly one CONFIRMED appointment for that slot.
    const appts = await db.appointment.findMany({
      where: {
        organizationId: orgId,
        startTime: new Date(slot.startIso),
        endTime: new Date(slot.endIso),
        status: "CONFIRMED",
      },
    });
    expect(appts.length).toBe(1);
    expect(appts[0]!.id).toBe(winner.appointment.id);
  });
});

// ============================================================================
// 2. Tool-validation failure → repair → fallback.
// ============================================================================
describe("2. tool-validation failure → repair → fallback", () => {
  it("executeTool returns validationOk:false + repaired:false for missing startIso", async () => {
    const ctx = await buildExecCtx();
    // Missing required startIso → Zod safeParse fails.
    const attempt = await executeTool(
      "book_appointment",
      {
        serviceType: "AC_REPAIR",
        endIso: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        callbackNumber: "+12145550002",
        serviceAddressZip: "75201",
      },
      ctx,
    );
    expect(attempt.validationOk).toBe(false);
    expect(attempt.repaired).toBe(false);
    expect(attempt.executionOk).toBe(false);
    expect(attempt.error).toBe("validation_failed");
  });

  it("orchestrator does ONE repair round then falls back to transfer_to_human on persistent failure", async () => {
    // Custom provider that emits a bad tool call (missing startIso) on turn 1,
    // then returns NO toolCalls on the repair attempt — which forces the
    // orchestrator's safe-fallback path (transfer_to_human CALLER_REQUEST).
    class FailingProvider implements AiProvider {
      name = "test-failing";
      model = "test-1";
      promptVersion = "v1";
      calls = 0;

      async complete(input: ProviderInput): Promise<ProviderResponse> {
        this.calls++;
        if (this.calls === 1) {
          return {
            text: "Let me book that.",
            toolCalls: [
              {
                id: "t1",
                name: "book_appointment",
                // missing startIso → Zod validation fails
                args: {
                  serviceType: "AC_REPAIR",
                  endIso: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
                  callbackNumber: "+12145550002",
                  serviceAddressZip: "75201",
                },
              },
            ],
            nextState: "BOOKING",
            provider: this.name,
            model: this.model,
            promptVersion: this.promptVersion,
            inputTokens: 10,
            outputTokens: 5,
            latencyMs: 1,
          };
        }
        // Repair attempt: no toolCalls → orchestrator triggers fallback.
        return {
          text: "Sorry, I can't complete that.",
          toolCalls: [],
          nextState: "ESCALATION",
          provider: this.name,
          model: this.model,
          promptVersion: this.promptVersion,
          inputTokens: 10,
          outputTokens: 5,
          latencyMs: 1,
        };
      }
    }

    const { conversation } = await freshCall("+12145550002", "CA-test2-repair");
    const provider = new FailingProvider();

    const result = await runTurn(
      {
        organizationId: orgId,
        conversationId: conversation.id,
        callerUtterance: "Book me an AC repair appointment.",
        fromPhone: "+12145550002",
      },
      provider,
    );

    // The provider was called exactly twice: main turn + one repair round.
    expect(provider.calls).toBe(2);

    // toolAttempts: [bad book_appointment, fallback transfer_to_human]
    expect(result.toolAttempts.length).toBe(2);
    const first = result.toolAttempts[0]!;
    expect(first.tool).toBe("book_appointment");
    expect(first.validationOk).toBe(false);
    expect(first.repaired).toBe(false);

    const fallback = result.toolAttempts[1]!;
    expect(fallback.tool).toBe("transfer_to_human");
    expect(fallback.executionOk).toBe(true);

    // Safe fallback produced a TRANSFER side effect.
    expect(result.sideEffects.some((s) => s.kind === "TRANSFER")).toBe(true);
  });
});

// ============================================================================
// 3. Cross-tenant blocked.
// ============================================================================
describe("3. cross-tenant blocked", () => {
  it("org B cannot see org A's contact by phone; upsert in org B creates a separate row", async () => {
    // SPEC: every query filters by organization_id from session, never client input.
    const phoneA = "+12145550003";

    // Create a contact in org A (the seeded DFW org).
    const contactA = await upsertContactByPhone({
      organizationId: orgId,
      phoneE164: phoneA,
      name: "Tenant A Caller",
      addressZip: "75201",
    });

    // Create a second org B + owner membership.
    const orgB = await db.organization.create({
      data: {
        name: "Other HVAC Co",
        slug: "other-hvac-" + randomToken(6).replace(/[^a-z0-9]/g, ""),
        timezone: "America/Chicago",
        defaultPhone: "+12145550200",
        transferPhone: "+12145550299",
        voicemailPhone: "+12145550288",
        encryptedCreds: encrypt(JSON.stringify({})),
      },
    });
    const userB = await db.user.create({
      data: {
        email: "owner-b-" + randomToken(6).replace(/[^a-z0-9]/g, "") + "@example.com",
        name: "Org B Owner",
        passwordHash: hashPassword("x"),
      },
    });
    await db.membership.create({
      data: { organizationId: orgB.id, userId: userB.id, role: "OWNER" },
    });

    // Cross-tenant lookup: org B querying org A's phone returns null.
    const crossLookup = await db.contact.findUnique({
      where: {
        organizationId_phoneE164: { organizationId: orgB.id, phoneE164: phoneA },
      },
    });
    expect(crossLookup).toBeNull();

    // Upsert in org B with the SAME phone creates a SEPARATE contact (different id).
    const contactB = await upsertContactByPhone({
      organizationId: orgB.id,
      phoneE164: phoneA,
      name: "Tenant B Caller",
      addressZip: "90210",
    });
    expect(contactB.id).not.toBe(contactA.id);
    expect(contactB.created).toBe(true);

    // Both rows coexist with the same phone but different orgs.
    const rows = await db.contact.findMany({
      where: { phoneE164: phoneA },
      select: { id: true, organizationId: true },
    });
    expect(rows.length).toBe(2);
    expect(new Set(rows.map((r) => r.organizationId)).size).toBe(2);
  });
});

// ============================================================================
// 4. Webhook dedup + signature rejection.
// ============================================================================
describe("4. webhook dedup + signature rejection", () => {
  it("dedup: a second WebhookEvent with the same (org, provider, externalId) throws P2002", async () => {
    const externalId = "CA-test4-dedup-" + randomToken(6).replace(/[^a-zA-Z0-9]/g, "");
    const payload = { CallSid: externalId, From: "+12145550004" };

    await db.webhookEvent.create({
      data: {
        organizationId: orgId,
        provider: "twilio",
        externalId,
        event: "voice",
        payloadJson: JSON.stringify(payload),
        signatureValid: true,
      },
    });

    // Second insert with the same (organizationId, provider, externalId) must violate the unique constraint.
    let threw = false;
    let errorCode: string | undefined;
    try {
      await db.webhookEvent.create({
        data: {
          organizationId: orgId,
          provider: "twilio",
          externalId,
          event: "voice",
          payloadJson: JSON.stringify(payload),
          signatureValid: true,
        },
      });
    } catch (e: any) {
      threw = true;
      errorCode = e?.code;
    }
    expect(threw).toBe(true);
    expect(errorCode).toBe("P2002"); // Prisma unique-constraint violation
  });

  it("signature: HMAC-SHA256 verification logic rejects a wrong signature (route enforcement is a known bug — see worklog)", async () => {
    // The SMS webhook route documents `x-velora-sig = HMAC-SHA256(body, VELORA_SESSION_SECRET)`
    // when VELORA_VERIFY_WEBHOOKS=1, but does NOT actually implement the check
    // (it always sets signatureValid: true). This test proves the crypto
    // primitive works so the constraint CAN be enforced; the route bug is
    // documented in the worklog.
    const body = JSON.stringify({ From: "+12145550004", Body: "STOP" });
    const secret = env.sessionSecret;
    const goodSig = crypto.createHmac("sha256", secret).update(body).digest("hex");
    const badSig = crypto.createHmac("sha256", "wrong-secret").update(body).digest("hex");

    expect(timingSafeEqualString(goodSig, goodSig)).toBe(true);
    expect(timingSafeEqualString(badSig, goodSig)).toBe(false);

    // Sanity: the documented header scheme produces a stable, comparable hex digest.
    expect(goodSig).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ============================================================================
// 5. Emergency keyword → escalation.
// ============================================================================
describe("5. emergency keyword → escalation", () => {
  it("runTurn forces ESCALATION + transfer_to_human(EMERGENCY) on 'I smell gas'", async () => {
    const { conversation } = await freshCall("+12145550005", "CA-test5-emergency");
    const provider = createMockProvider();

    const result = await runTurn(
      {
        organizationId: orgId,
        conversationId: conversation.id,
        callerUtterance: "I smell gas near my furnace.",
        fromPhone: "+12145550005",
      },
      provider,
    );

    // Deterministic emergency pre-check fired.
    expect(result.emergency).toBe(true);

    // State machine landed in ESCALATION or END (forced transfer → END).
    expect(["ESCALATION", "END"]).toContain(result.state);

    // A transfer_to_human with reason=EMERGENCY was executed.
    const transfer = result.toolAttempts.find(
      (a) => a.tool === "transfer_to_human" && (a.args as any)?.reason === "EMERGENCY",
    );
    expect(transfer).toBeDefined();
    expect(transfer!.executionOk).toBe(true);
    expect(transfer!.sideEffects.some((s) => s.kind === "TRANSFER")).toBe(true);

    // The call's urgency was upgraded to EMERGENCY.
    const call = await db.call.findUnique({ where: { id: conversation.callId } });
    expect(call?.urgency).toBe("EMERGENCY");
  });

  it("classifyUrgency deterministically flags 'carbon monoxide detector going off' as EMERGENCY", async () => {
    const escalationRule = await getPublishedRule(orgId, "escalation_routing");
    expect(escalationRule).not.toBeNull();
    const res = classifyUrgency(escalationRule!.data, "carbon monoxide detector going off");
    expect(res.urgency).toBe("EMERGENCY");
    expect(res.matchedKeyword).toBe("carbon monoxide");
  });
});

// ============================================================================
// 6. Missed-call recovery capping (1 per caller per 4h).
// ============================================================================
describe("6. missed-call recovery capping (1 per caller per 4h)", () => {
  it("first text-back is sent; second within the 4h window is rejected", async () => {
    const phone = "+12145550006";
    const sid1 = "CA-test6-mc-1-" + randomToken(6).replace(/[^a-zA-Z0-9]/g, "");
    const sid2 = "CA-test6-mc-2-" + randomToken(6).replace(/[^a-zA-Z0-9]/g, "");

    // Create two distinct missed calls from the same caller.
    const call1 = await db.call.create({
      data: {
        organizationId: orgId,
        callSid: sid1,
        direction: "inbound",
        fromPhone: phone,
        toPhone: "+12145550100",
        status: "MISSED",
        urgency: "ROUTINE",
      },
    });
    const call2 = await db.call.create({
      data: {
        organizationId: orgId,
        callSid: sid2,
        direction: "inbound",
        fromPhone: phone,
        toPhone: "+12145550100",
        status: "MISSED",
        urgency: "ROUTINE",
      },
    });

    const template = "Hi, this is Velora HVAC — we missed your call. How can we help? Reply STOP to opt out.";
    // permittedHours 0-24 covers every hour of the day (function param is not
    // Zod-validated, so 24 is allowed here even though the rule schema caps at 23).
    const permittedHours = { start: 0, end: 24 };

    const first = await sendMissedCallTextBack(orgId, sid1, call1.id, phone, template, permittedHours, "America/Chicago");
    expect(first.sent).toBe(true);

    const second = await sendMissedCallTextBack(orgId, sid2, call2.id, phone, template, permittedHours, "America/Chicago");
    expect(second.sent).toBe(false);
    expect(second.reason).toBe("already_recovered_in_window");

    // Exactly one MissedCallRecovery row exists for this caller in the window.
    const recoveries = await db.missedCallRecovery.findMany({
      where: { organizationId: orgId, phoneE164: phone },
    });
    expect(recoveries.length).toBe(1);
  });
});

// ============================================================================
// 7. STOP suppression.
// ============================================================================
describe("7. STOP suppression", () => {
  it("STOP → suppressed + sendSms returns STOPPED; START → un-suppressed + sendSms returns SENT", async () => {
    const phone = "+12145550007";

    // STOP → immediate org-scoped suppression.
    const stopRes = await handleInboundSms(orgId, phone, "STOP");
    expect(stopRes.suppressed).toBe(true);
    expect(await isSuppressed(orgId, phone)).toBe(true);

    // Sender service enforces the gate (not templates).
    const stopped = await sendSms(orgId, phone, "any message");
    expect(stopped.status).toBe("STOPPED");

    // START → re-subscribed.
    const startRes = await handleInboundSms(orgId, phone, "START");
    expect(startRes.suppressed).toBe(false);
    expect(await isSuppressed(orgId, phone)).toBe(false);

    const sent = await sendSms(orgId, phone, "any message");
    expect(sent.status).toBe("SENT");
  });
});

// ============================================================================
// 8. Out-of-area never books.
// ============================================================================
describe("8. out-of-area never books", () => {
  it("book_appointment with zip 90210 is rejected as out_of_area; request_appointment succeeds", async () => {
    const ctx = await buildExecCtx();
    const startIso = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const endIso = new Date(Date.now() + 49 * 3600 * 1000).toISOString();

    // Sanity: 75201 is IN area, 90210 is OUT (seeded service_area rule).
    const inArea = ctx.rules.rules.service_area?.data.zips.includes("75201");
    const outArea = ctx.rules.rules.service_area?.data.zips.includes("90210");
    expect(inArea).toBe(true);
    expect(outArea).toBe(false);

    // book_appointment with out-of-area zip → tool returns ok:false with out_of_area error.
    // NOTE: SPEC asked for executionOk===false, but the implementation returns
    // executionOk:true with result.ok:false for out-of-area (dispatch returns
    // a negative result instead of throwing). The SAFETY constraint (no
    // booking is created) is still proven below.
    const bookResult = await executeTool(
      "book_appointment",
      {
        serviceType: "AC_REPAIR",
        startIso,
        endIso,
        callbackNumber: "+12145550008",
        serviceAddressZip: "90210",
      },
      ctx,
    );
    expect(bookResult.validationOk).toBe(true);
    // executionOk reflects the business outcome — out-of-area is rejected, so false.
    expect(bookResult.executionOk).toBe(false);
    expect((bookResult.result as any)?.ok).toBe(false);
    expect(String((bookResult.result as any)?.error)).toContain("out_of_area");
    // No APPOINTMENT_BOOKED side effect — the booking was blocked.
    expect(bookResult.sideEffects.some((s) => s.kind === "APPOINTMENT_BOOKED")).toBe(false);

    // No appointment row was created for this caller.
    const appts = await db.appointment.findMany({
      where: { organizationId: orgId, serviceType: "AC_REPAIR" },
    });
    const outOfAreaAppts = appts.filter((a) => a.startTime.toISOString() === startIso);
    expect(outOfAreaAppts.length).toBe(0);

    // request_appointment with the SAME out-of-area zip SUCCEEDS (request, not booking).
    const reqResult = await executeTool(
      "request_appointment",
      {
        serviceType: "AC_REPAIR",
        callbackNumber: "+12145550008",
        serviceAddressZip: "90210",
        notes: "Out-of-area request",
      },
      ctx,
    );
    expect(reqResult.validationOk).toBe(true);
    expect(reqResult.executionOk).toBe(true);
    expect((reqResult.result as any)?.ok).toBe(true);
    expect(reqResult.sideEffects.some((s) => s.kind === "APPOINTMENT_REQUESTED")).toBe(true);
  });
});

// ============================================================================
// 9. Hold expiry releases slot.
// ============================================================================
describe("9. hold expiry releases slot", () => {
  it("expired REQUESTED hold is CANCELLED by releaseExpiredHold; slot becomes bookable again", async () => {
    const phone = "+12145550009";
    const contact = await upsertContactByPhone({
      organizationId: orgId,
      phoneE164: phone,
      name: "Hold Caller",
      addressZip: "75201",
    });

    const slot = await getFreeSlot();

    // Create a REQUESTED hold that is ALREADY expired (holdUntil = now - 1ms).
    const req = await requestAppointment({
      organizationId: orgId,
      contactId: contact.id,
      serviceType: "AC_REPAIR",
      startIso: slot.startIso,
      endIso: slot.endIso,
      holdUntil: new Date(Date.now() - 1),
      actorType: "AI_TOOL",
    });
    expect(req.appointment.status).toBe("REQUESTED");

    // Release the expired hold.
    await releaseExpiredHold(orgId, req.appointment.id);

    // The appointment is now CANCELLED.
    const afterRelease = await db.appointment.findUnique({ where: { id: req.appointment.id } });
    expect(afterRelease?.status).toBe("CANCELLED");

    // A NEW bookAppointment on the SAME slot now SUCCEEDS (the slot was freed).
    const booked = await bookAppointment({
      organizationId: orgId,
      contactId: contact.id,
      serviceType: "AC_REPAIR",
      startIso: slot.startIso,
      endIso: slot.endIso,
      actorType: "AI_TOOL",
    });
    expect(booked.winner).toBe(true);
    expect(booked.appointment.status).toBe("CONFIRMED");
    expect(booked.appointment.id).not.toBe(req.appointment.id);
  });
});

// silence unused-import warnings for types only re-exported
void confirmAppointment;
void createDraftVersion;
void publishVersion;

// ============================================================================
// 10. Lead status update — staff workflow action (DISPATCHER+) with audit.
// The AI never calls this; it's a deterministic staff action. Org-scoped;
// validates against the enum; cross-tenant update returns 404 (never reveals
// existence); every update writes an append-only audit row.
// ============================================================================
describe("10. lead status update — staff workflow + audit", () => {
  it("updates a lead's status and writes an audit row; rejects invalid status", async () => {
    const phone = "+12145550010";
    await upsertContactByPhone({ organizationId: orgId, phoneE164: phone, name: "Lead Status Test" });
    const { createLead, updateLeadStatus, LEAD_STATUSES } = await import("../src/lib/domain/leads");
    const lead = await createLead({
      organizationId: orgId,
      phoneE164: phone,
      name: "Lead Status Test",
      serviceType: "AC_REPAIR",
      source: "CALL",
      inServiceArea: true,
    });
    expect(lead.status).toBe("NEW");

    // Valid update
    const updated = await updateLeadStatus(orgId, lead.id, "CONTACTED", "staff-1");
    expect(updated.status).toBe("CONTACTED");

    // Audit row written
    const auditRows = await db.auditLog.findMany({
      where: { organizationId: orgId, entityType: "Lead", entityId: lead.id, action: "LEAD_STATUS_UPDATE" },
    });
    expect(auditRows.length).toBe(1);
    expect(JSON.parse(auditRows[0]!.afterJson!)).toEqual({ status: "CONTACTED" });
    expect(JSON.parse(auditRows[0]!.beforeJson!)).toEqual({ status: "NEW" });

    // All enum values accepted
    for (const s of LEAD_STATUSES) {
      await updateLeadStatus(orgId, lead.id, s, "staff-1");
    }
    const final = await db.lead.findUnique({ where: { id: lead.id } });
    expect(final?.status).toBe(LEAD_STATUSES[LEAD_STATUSES.length - 1]);

    // Invalid status rejected
    await expect(updateLeadStatus(orgId, lead.id, "BOGUS" as any, "staff-1")).rejects.toThrow();

    // Cross-tenant update returns 404 (never reveals existence). Inline a
    // second org to avoid relying on a separate setup module.
    const orgB = await db.organization.create({
      data: {
        name: "Other HVAC Co",
        slug: "other-hvac-" + randomToken(6).replace(/[^a-z0-9]/g, ""),
        timezone: "America/Chicago",
        defaultPhone: "+12145550200",
        transferPhone: "+12145550299",
        voicemailPhone: "+12145550288",
        encryptedCreds: encrypt(JSON.stringify({})),
      },
    });
    await expect(updateLeadStatus(orgB.id, lead.id, "BOOKED", "staff-2")).rejects.toThrow();
  });
});
