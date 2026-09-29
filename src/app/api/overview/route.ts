import { db } from "@/lib/db";
import { ok } from "@/lib/errors";
import { withApi } from "@/lib/http";
import { maskPhone } from "@/lib/phone";

// Dashboard overview KPIs (org-scoped) + recent activity feed.
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
    recentCalls, recentLeads, recentAppts, upcomingAppts,
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
    // Recent activity (last 8 of each, org-scoped)
    db.call.findMany({
      where: { organizationId: orgId },
      orderBy: { startedAt: "desc" },
      take: 8,
      select: { id: true, status: true, urgency: true, serviceType: true, startedAt: true, fromPhone: true, contact: { select: { name: true } } },
    }),
    db.lead.findMany({
      where: { organizationId: orgId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, status: true, urgency: true, serviceType: true, createdAt: true, name: true, inServiceArea: true },
    }),
    db.appointment.findMany({
      where: { organizationId: orgId, createdAt: { gte: last30 } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, status: true, serviceType: true, startTime: true, createdAt: true, contact: { select: { name: true } } },
    }),
    // Upcoming confirmed appointments (next 5) for the "Today's schedule" mini-panel
    db.appointment.findMany({
      where: { organizationId: orgId, status: "CONFIRMED", startTime: { gte: now } },
      orderBy: { startTime: "asc" },
      take: 5,
      select: { id: true, serviceType: true, startTime: true, endTime: true, contact: { select: { name: true, phoneE164: true } } },
    }),
  ]);

  // Build a unified recent-activity timeline (merge + sort by timestamp, take 10)
  type Activity = { id: string; kind: "call" | "lead" | "appointment"; ts: string; title: string; subtitle: string; status: string; urgency?: string };
  const activities: Activity[] = [
    ...recentCalls.map((c) => ({ id: c.id, kind: "call" as const, ts: c.startedAt.toISOString(), title: c.contact?.name ?? maskPhone(c.fromPhone), subtitle: c.serviceType ?? "Inbound call", status: c.status, urgency: c.urgency })),
    ...recentLeads.map((l) => ({ id: l.id, kind: "lead" as const, ts: l.createdAt.toISOString(), title: l.name ?? "New lead", subtitle: l.serviceType ?? "Lead", status: l.status, urgency: l.urgency })),
    ...recentAppts.map((a) => ({ id: a.id, kind: "appointment" as const, ts: a.createdAt.toISOString(), title: a.contact?.name ?? "Appointment", subtitle: a.serviceType, status: a.status })),
  ];
  activities.sort((a, b) => (a.ts < b.ts ? 1 : -1));

  return Response.json(ok({
    calls: { total: callsTotal, last7: callsLast7, missedLast7, byOutcome: Object.fromEntries(callsByOutcome.map((o) => [o.outcome ?? "NONE", o._count])) },
    leads: { total: leadsTotal, new: leadsNew, byUrgency: Object.fromEntries(leadsByUrgency.map((o) => [o.urgency, o._count])) },
    appointments: { today: apptsToday, upcoming: apptsUpcoming, byStatus: Object.fromEntries(apptsByStatus.map((o) => [o.status, o._count])) },
    contacts: { total: contactsTotal },
    sms: { sentLast7: smsSentLast7, suppressedLast7: smsSuppressedLast7 },
    ai: { turnsLast7: aiTurnsLast7, costMicroUsdLast7: aiCostMicroLast7._sum.costMicroUsd ?? 0 },
    window: { last7: last7.toISOString(), last30: last30.toISOString(), now: now.toISOString() },
    activity: activities.slice(0, 10),
    upcoming: upcomingAppts.map((a) => ({ id: a.id, serviceType: a.serviceType, startTime: a.startTime.toISOString(), endTime: a.endTime.toISOString(), contactName: a.contact?.name ?? "—", phone: a.contact?.phoneE164 ?? null })),
  }));
});
