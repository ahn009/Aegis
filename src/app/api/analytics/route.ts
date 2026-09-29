import { db } from "@/lib/db";
import { ok } from "@/lib/errors";
import { withApi } from "@/lib/http";

// Analytics: call/lead/appointment rollups + usage/cost per AI turn.
export const GET = withApi(async ({ user }) => {
  const orgId = user.organizationId;
  const now = new Date();
  const days: { date: string; label: string }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    days.push({ date: d.toISOString().slice(0, 10), label: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) });
  }

  // Calls per day (by startedAt date in org tz approximated as UTC date)
  const calls = await db.call.findMany({
    where: { organizationId: orgId, startedAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) } },
    select: { startedAt: true, status: true, urgency: true },
  });
  const callsByDay = days.map((d) => {
    const dayCalls = calls.filter((c) => c.startedAt.toISOString().slice(0, 10) === d.date);
    return {
      date: d.date,
      label: d.label,
      total: dayCalls.length,
      completed: dayCalls.filter((c) => c.status === "COMPLETED").length,
      missed: dayCalls.filter((c) => c.status === "MISSED").length,
      voicemail: dayCalls.filter((c) => c.status === "VOICEMAIL").length,
      transferred: dayCalls.filter((c) => c.status === "TRANSFERRED").length,
      emergency: dayCalls.filter((c) => c.urgency === "EMERGENCY").length,
    };
  });

  // Leads per day
  const leads = await db.lead.findMany({
    where: { organizationId: orgId, createdAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) } },
    select: { createdAt: true, urgency: true, status: true },
  });
  const leadsByDay = days.map((d) => {
    const dl = leads.filter((l) => l.createdAt.toISOString().slice(0, 10) === d.date);
    return {
      date: d.date,
      label: d.label,
      total: dl.length,
      routine: dl.filter((l) => l.urgency === "ROUTINE").length,
      urgent: dl.filter((l) => l.urgency === "URGENT").length,
      emergency: dl.filter((l) => l.urgency === "EMERGENCY").length,
    };
  });

  // Appointments per day (created)
  const appts = await db.appointment.findMany({
    where: { organizationId: orgId, createdAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) } },
    select: { createdAt: true, status: true, serviceType: true },
  });
  const apptsByDay = days.map((d) => {
    const da = appts.filter((a) => a.createdAt.toISOString().slice(0, 10) === d.date);
    return {
      date: d.date,
      label: d.label,
      total: da.length,
      confirmed: da.filter((a) => a.status === "CONFIRMED").length,
      requested: da.filter((a) => a.status === "REQUESTED").length,
      cancelled: da.filter((a) => a.status === "CANCELLED").length,
    };
  });

  // Service-type breakdown
  const byServiceType = await db.appointment.groupBy({
    by: ["serviceType"],
    where: { organizationId: orgId, createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
    _count: true,
  });

  // AI usage/cost per day
  const turns = await db.conversationTurn.findMany({
    where: { conversation: { organizationId: orgId }, createdAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) } },
    select: { createdAt: true, provider: true, inputTokens: true, outputTokens: true, latencyMs: true, costMicroUsd: true },
  });
  const aiByDay = days.map((d) => {
    const dt = turns.filter((t) => t.createdAt.toISOString().slice(0, 10) === d.date);
    return {
      date: d.date,
      label: d.label,
      turns: dt.length,
      inputTokens: dt.reduce((s, t) => s + t.inputTokens, 0),
      outputTokens: dt.reduce((s, t) => s + t.outputTokens, 0),
      avgLatencyMs: dt.length ? Math.round(dt.reduce((s, t) => s + t.latencyMs, 0) / dt.length) : 0,
      costMicroUsd: dt.reduce((s, t) => s + t.costMicroUsd, 0),
    };
  });

  return Response.json(ok({
    callsByDay, leadsByDay, apptsByDay, aiByDay,
    byServiceType: byServiceType.map((s) => ({ serviceType: s.serviceType, count: s._count })),
    totals: {
      calls14d: callsByDay.reduce((s, d) => s + d.total, 0),
      leads14d: leadsByDay.reduce((s, d) => s + d.total, 0),
      appts14d: apptsByDay.reduce((s, d) => s + d.total, 0),
      aiTurns14d: aiByDay.reduce((s, d) => s + d.turns, 0),
      aiCostMicroUsd14d: aiByDay.reduce((s, d) => s + d.costMicroUsd, 0),
    },
  }));
});
