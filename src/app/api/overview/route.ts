import { db } from "@/lib/db";
import { ok } from "@/lib/errors";
import { withApi } from "@/lib/http";

// Dashboard overview KPIs (org-scoped).
export const GET = withApi(async ({ user }) => {
  const orgId = user.organizationId;
  const now = new Date();
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    callsTotal, callsLast7, missedLast7, callsByOutcome,
    leadsTotal, leadsNew, leadsByUrgency,
    apptsToday, apptsUpcoming, apptsByStatus,
    contactsTotal,
    smsSentLast7, smsSuppressedLast7,
    aiTurnsLast7, aiCostMicroLast7,
  ] = await Promise.all([
    db.call.count({ where: { organizationId: orgId } }),
    db.call.count({ where: { organizationId: orgId, startedAt: { gte: last7 } } }),
    db.call.count({ where: { organizationId: orgId, status: "MISSED", startedAt: { gte: last7 } } }),
    db.conversation.groupBy({ by: ["outcome"], where: { organizationId: orgId }, _count: true }),
    db.lead.count({ where: { organizationId: orgId, deletedAt: null } }),
    db.lead.count({ where: { organizationId: orgId, status: "NEW", deletedAt: null } }),
    db.lead.groupBy({ by: ["urgency"], where: { organizationId: orgId, deletedAt: null }, _count: true }),
    db.appointment.count({ where: { organizationId: orgId, startTime: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) , lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) } } }),
    db.appointment.count({ where: { organizationId: orgId, status: "CONFIRMED", startTime: { gte: now } } }),
    db.appointment.groupBy({ by: ["status"], where: { organizationId: orgId }, _count: true }),
    db.contact.count({ where: { organizationId: orgId, deletedAt: null } }),
    db.smsMessage.count({ where: { organizationId: orgId, direction: "OUTBOUND", status: "SENT", createdAt: { gte: last7 } } }),
    db.smsMessage.count({ where: { organizationId: orgId, status: "STOPPED", createdAt: { gte: last7 } } }),
    db.conversationTurn.count({ where: { conversation: { organizationId: orgId }, createdAt: { gte: last7 } } }),
    db.conversationTurn.aggregate({ where: { conversation: { organizationId: orgId }, createdAt: { gte: last7 } }, _sum: { costMicroUsd: true } }),
  ]);

  return Response.json(ok({
    calls: { total: callsTotal, last7: callsLast7, missedLast7, byOutcome: Object.fromEntries(callsByOutcome.map((o) => [o.outcome ?? "NONE", o._count])) },
    leads: { total: leadsTotal, new: leadsNew, byUrgency: Object.fromEntries(leadsByUrgency.map((o) => [o.urgency, o._count])) },
    appointments: { today: apptsToday, upcoming: apptsUpcoming, byStatus: Object.fromEntries(apptsByStatus.map((o) => [o.status, o._count])) },
    contacts: { total: contactsTotal },
    sms: { sentLast7: smsSentLast7, suppressedLast7: smsSuppressedLast7 },
    ai: { turnsLast7: aiTurnsLast7, costMicroUsdLast7: aiCostMicroLast7._sum.costMicroUsd ?? 0 },
    window: { last7: last7.toISOString(), last30: last30.toISOString(), now: now.toISOString() },
  }));
});
