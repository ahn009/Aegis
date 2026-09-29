"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { fmtRelative, fmtService, fmtTime } from "./format";
import { CalendarDays, CalendarCheck2, PhoneIncoming, UserRoundPlus, Activity } from "lucide-react";

type ActivityItem = { id: string; kind: "call" | "lead" | "appointment"; ts: string; title: string; subtitle: string; status: string; urgency?: string };
type AppointmentItem = { id: string; startTime: string; serviceType: string; contactName: string };
type OverviewData = {
  calls: { last7: number; missedLast7: number };
  leads: { new: number };
  appointments: { today: number; upcoming: number };
  activity: ActivityItem[];
  upcoming: AppointmentItem[];
};

export function Overview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const result = await api.overview() as OverviewData;
        if (mounted) { setData(result); setError(null); }
      } catch (e) {
        if (mounted) setError((e as Error).message);
      }
    }
    load();
    const timer = setInterval(load, 15000);
    return () => { mounted = false; clearInterval(timer); };
  }, []);

  if (error && !data) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Could not load the overview. {error}</div>;
  if (!data) return <div className="rounded-xl border bg-white p-6 text-sm text-zinc-500">Loading overview…</div>;

  const stats = [
    { label: "Calls this week", value: data.calls.last7, detail: `${data.calls.missedLast7} missed`, icon: PhoneIncoming },
    { label: "New leads", value: data.leads.new, detail: "Need follow-up", icon: UserRoundPlus },
    { label: "Appointments today", value: data.appointments.today, detail: `${data.appointments.upcoming} upcoming`, icon: CalendarCheck2 },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Workspace overview</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Your day at a glance</h2>
        <p className="mt-2 text-sm text-zinc-500">The calls, leads, and appointments that need your attention.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, detail, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-medium text-zinc-500">{label}</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Icon className="h-4 w-4" /></span>
            </div>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-zinc-500">{detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,1fr)]">
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm" aria-labelledby="activity-heading">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <div className="flex items-center gap-2.5"><Activity className="h-4 w-4 text-emerald-700" /><h3 id="activity-heading" className="font-semibold">Recent activity</h3></div>
            <span className="text-xs text-zinc-400">Latest updates</span>
          </div>
          {data.activity.length ? (
            <ul className="divide-y divide-zinc-100">
              {data.activity.slice(0, 6).map((item) => (
                <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
                    {item.kind === "call" ? <PhoneIncoming className="h-4 w-4" /> : item.kind === "lead" ? <UserRoundPlus className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">{item.title}</p>
                    <p className="truncate text-xs text-zinc-500">{item.kind === "appointment" ? "Appointment" : item.kind === "lead" ? "Lead" : "Call"} · {item.status.replace(/_/g, " ").toLowerCase()}</p>
                  </div>
                  <span className="shrink-0 text-xs text-zinc-400">{fmtRelative(item.ts)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="px-5 py-12 text-center text-sm text-zinc-500">Activity will appear here as calls and bookings come in.</p>}
        </section>

        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm" aria-labelledby="schedule-heading">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <div className="flex items-center gap-2.5"><CalendarDays className="h-4 w-4 text-emerald-700" /><h3 id="schedule-heading" className="font-semibold">Upcoming appointments</h3></div>
            <span className="text-xs text-zinc-400">Next up</span>
          </div>
          {data.upcoming.length ? (
            <ul className="divide-y divide-zinc-100">
              {data.upcoming.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                    <span className="text-[10px] font-medium uppercase leading-none">{new Date(item.startTime).toLocaleDateString("en-US", { month: "short" })}</span>
                    <span className="mt-1 text-base font-semibold leading-none">{new Date(item.startTime).getDate()}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">{fmtService(item.serviceType)}</p>
                    <p className="truncate text-xs text-zinc-500">{item.contactName}</p>
                  </div>
                  <span className="shrink-0 text-xs text-zinc-500">{fmtTime(item.startTime)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="px-5 py-12 text-center text-sm text-zinc-500">No upcoming appointments.</p>}
        </section>
      </div>
    </div>
  );
}
