import { describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { createLead, updateLeadStatus } from "../src/lib/domain/leads";
import { bookAppointment, cancelAppointment, confirmAppointment, releaseExpiredHold, requestAppointment } from "../src/lib/domain/appointments";
import { createDraftVersion, loadRuleContext, publishVersion } from "../src/lib/rules/engine";
import { upsertContactByPhone } from "../src/lib/domain/contacts";
import { handleInboundSms, sendSms } from "../src/lib/domain/messaging";
import { endCall, startInboundCall } from "../src/lib/domain/calls";
import { processOutbox } from "../src/lib/worker/outbox";
import { executeTool } from "../src/lib/ai/tool-executor";

async function failAuditDuring(action: () => Promise<unknown>) {
  await db.$executeRawUnsafe('CREATE TRIGGER fail_audit BEFORE INSERT ON "AuditLog" BEGIN SELECT RAISE(ABORT, "audit unavailable"); END');
  try {
    await expect(action()).rejects.toThrow();
  } finally {
    await db.$executeRawUnsafe("DROP TRIGGER fail_audit");
  }
}

describe("staff action audit durability", () => {
  it("rolls back a lead status change when its audit row cannot be written", async () => {
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    const lead = await db.lead.create({ data: { organizationId: org.id, phoneE164: "+12145550121" } });
    await failAuditDuring(() => updateLeadStatus(org.id, lead.id, "CONTACTED"));
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("NEW");
    expect(await db.auditLog.count({ where: { action: "LEAD_STATUS_UPDATE", entityId: lead.id } })).toBe(0);
  });

  it("rolls back appointment confirmation when its audit row cannot be written", async () => {
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    const appointment = await db.appointment.create({ data: { organizationId: org.id, serviceType: "REPAIR", status: "REQUESTED", startTime: new Date("2026-12-01T12:00:00Z"), endTime: new Date("2026-12-01T13:00:00Z") } });
    await failAuditDuring(() => confirmAppointment(org.id, appointment.id));
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe("REQUESTED");
    expect(await db.auditLog.count({ where: { action: "APPOINTMENT_CONFIRM", entityId: appointment.id } })).toBe(0);
  });

  it("rolls back a rule draft when its audit row cannot be written", async () => {
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    const before = await db.businessRuleVersion.count({ where: { organizationId: org.id, ruleType: "holidays" } });
    await failAuditDuring(() => createDraftVersion(org.id, "holidays", { type: "holidays", holidays: [] }));
    expect(await db.businessRuleVersion.count({ where: { organizationId: org.id, ruleType: "holidays" } })).toBe(before);
  });

  it("rolls back appointment cancellation and rule publishing on audit failure", async () => {
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    const appointment = await db.appointment.create({ data: { organizationId: org.id, serviceType: "REPAIR", startTime: new Date("2026-12-02T12:00:00Z"), endTime: new Date("2026-12-02T13:00:00Z"), notes: "Original note" } });
    const draft = await createDraftVersion(org.id, "holidays", { type: "holidays", holidays: [] });
    await failAuditDuring(() => cancelAppointment(org.id, appointment.id, "test reason"));
    expect(await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).toMatchObject({ status: "CONFIRMED", notes: "Original note" });
    await failAuditDuring(() => publishVersion(org.id, "holidays", draft.version));
    expect((await db.businessRuleVersion.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("DRAFT");
  });

  it("rolls back contact and lead creation and hold expiry on audit failure", async () => {
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    await failAuditDuring(() => upsertContactByPhone({ organizationId: org.id, phoneE164: "+12145550141", name: "Rollback contact" }));
    expect(await db.contact.count({ where: { organizationId: org.id, phoneE164: "+12145550141" } })).toBe(0);
    await failAuditDuring(() => createLead({ organizationId: org.id, phoneE164: "+12145550142", name: "Rollback lead" }));
    expect(await db.lead.count({ where: { organizationId: org.id, phoneE164: "+12145550142" } })).toBe(0);
    const appointment = await db.appointment.create({ data: { organizationId: org.id, serviceType: "REPAIR", status: "REQUESTED", holdUntil: new Date(Date.now() - 1000), startTime: new Date("2026-12-03T12:00:00Z"), endTime: new Date("2026-12-03T13:00:00Z") } });
    await failAuditDuring(() => releaseExpiredHold(org.id, appointment.id));
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe("REQUESTED");
  });

  it("refuses to attach a lead to another organization's contact", async () => {
    const first = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    const second = await db.organization.create({ data: { name: "Lead link tenant", slug: `lead-link-${Date.now()}` } });
    const foreign = await db.contact.create({ data: { organizationId: second.id, phoneE164: "+12145550143" } });
    await expect(createLead({ organizationId: first.id, contactId: foreign.id, phoneE164: "+12145550144" })).rejects.toMatchObject({ status: 404 });
    expect(await db.lead.count({ where: { organizationId: first.id, phoneE164: "+12145550144" } })).toBe(0);
  });

  it("rolls back appointment creation and reminder/hold events on audit failure", async () => {
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    const base = { organizationId: org.id, serviceType: "AUDIT_ROLLBACK", startIso: "2027-01-10T12:00:00Z", endIso: "2027-01-10T13:00:00Z" };
    const beforeOutbox = await db.outboxEvent.count({ where: { organizationId: org.id } });
    await failAuditDuring(() => bookAppointment(base));
    await failAuditDuring(() => requestAppointment(base));
    expect(await db.appointment.count({ where: { organizationId: org.id, serviceType: "AUDIT_ROLLBACK" } })).toBe(0);
    expect(await db.outboxEvent.count({ where: { organizationId: org.id } })).toBe(beforeOutbox);
  });

  it("refuses appointment references from another organization", async () => {
    const first = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    const second = await db.organization.create({ data: { name: "Appointment link tenant", slug: `appointment-link-${Date.now()}` } });
    const foreign = await db.contact.create({ data: { organizationId: second.id, phoneE164: "+12145550145" } });
    await expect(bookAppointment({ organizationId: first.id, contactId: foreign.id, serviceType: "REPAIR", startIso: "2027-01-11T12:00:00Z", endIso: "2027-01-11T13:00:00Z" })).rejects.toMatchObject({ status: 404 });
    expect(await db.appointment.count({ where: { organizationId: first.id, contactId: foreign.id } })).toBe(0);
  });

  it("rolls back a simulated SMS send and suppression record when audit fails", async () => {
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    const phone = "+12145550146";
    await failAuditDuring(() => sendSms(org.id, phone, "test message"));
    expect(await db.smsMessage.count({ where: { organizationId: org.id, toPhone: phone } })).toBe(0);
    await db.smsOptOut.create({ data: { organizationId: org.id, phoneE164: phone, reason: "STOP" } });
    await failAuditDuring(() => sendSms(org.id, phone, "test message"));
    expect(await db.smsMessage.count({ where: { organizationId: org.id, toPhone: phone } })).toBe(0);
  });

  it("rolls back inbound STOP and direct call creation when audit fails", async () => {
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    const phone = "+12145550147";
    await failAuditDuring(() => handleInboundSms(org.id, phone, "STOP"));
    expect(await db.smsOptOut.count({ where: { organizationId: org.id, phoneE164: phone } })).toBe(0);
    expect(await db.smsMessage.count({ where: { organizationId: org.id, toPhone: phone } })).toBe(0);
    const callSid = `audit-call-${Date.now()}`;
    await failAuditDuring(() => startInboundCall({ organizationId: org.id, callSid, fromPhone: phone, toPhone: "+12145550148" }));
    expect(await db.call.count({ where: { callSid } })).toBe(0);
  });

  it("rolls back call and conversation status when the status audit fails", async () => {
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    const started = await startInboundCall({
      organizationId: org.id, callSid: `audit-end-${Date.now()}`,
      fromPhone: "+12145550149", toPhone: "+12145550100",
    });
    await failAuditDuring(() => endCall(org.id, started.call.id, "COMPLETED", "ENDED"));
    expect((await db.call.findUniqueOrThrow({ where: { id: started.call.id } })).status).toBe("IN_PROGRESS");
    expect((await db.conversation.findUniqueOrThrow({ where: { id: started.conversation.id } })).state).toBe("GREETING");
  });

  it("does not advance a failed outbox attempt without its audit row", async () => {
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    const event = await db.outboxEvent.create({ data: {
      organizationId: org.id, eventType: "REMINDER_2H", payloadJson: "invalid-json",
      processAfter: new Date(Date.now() - 1000),
    } });
    await failAuditDuring(() => processOutbox(1, org.id));
    const after = await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(after.attempts).toBe(0);
    expect(after.status).toBe("PROCESSING");
    expect(await db.auditLog.count({ where: { action: "OUTBOX_RETRY", entityId: event.id } })).toBe(0);
  });

  it("records successful AI tool attempts and refuses an unaudited result", async () => {
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    const ctx = {
      organizationId: org.id, supportedServices: [], rules: await loadRuleContext(org.id),
      org: { name: org.name, timezone: org.timezone },
    };
    const result = await executeTool("check_service_area", { zip: "75201" }, ctx);
    expect(result.executionOk).toBe(true);
    expect(await db.auditLog.count({ where: { organizationId: org.id, action: "AI_TOOL_EXEC", actorId: "check_service_area" } })).toBe(1);
    await failAuditDuring(() => executeTool("check_service_area", { zip: "75201" }, ctx));
    expect(await db.auditLog.count({ where: { organizationId: org.id, action: "AI_TOOL_EXEC", actorId: "check_service_area" } })).toBe(1);
  });
});
