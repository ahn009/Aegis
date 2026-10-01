import { describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { updateLeadStatus } from "../src/lib/domain/leads";
import { cancelAppointment, confirmAppointment } from "../src/lib/domain/appointments";
import { createDraftVersion, publishVersion } from "../src/lib/rules/engine";

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
});
