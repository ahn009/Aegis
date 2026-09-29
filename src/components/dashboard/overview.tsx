"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDateShort, fmtTime, fmtRelative, fmtCost, fmtStatus, fmtUrgency, fmtService, fmtPhone } from "./format";
import {
  Phone, PhoneOff, CalendarCheck, Users, MessageSquare, Ban, Cpu, TrendingUp, Activity,
  PhoneIncoming, UserPlus, Clock, ArrowUpRight, Circle, CalendarClock,
} from "lucide-react";

export function Overview() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const d = await api.overview().catch((e) => { if (mounted) setError(e.message); return null; });
      if (mounted) { setData(d); setLoading(false); }
    })();
    const t = setInterval(async () => {
      const d = await api.overview().catch(() => null);
      if (mounted && d) setData(d);
    }, 15000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  if (loading) return <div className="text-muted-foreground text-sm">Loading overview…</div>;
  if (error || !data) return <div className="text-destructive text-sm">{error ?? "Failed to load"}</div>;

  const kpis = [
    { label: "Calls (7d)", value: data.calls.last7, sub: `${data.calls.missedLast7} missed`, icon: Phone, accent: "text-sky-600 bg-sky-50", ring: "ring-sky-100" },
    { label: "Leads (new)", value: data.leads.new, sub: `${data.leads.total} total`, icon: Users, accent: "text-violet-600 bg-violet-50", ring: "ring-violet-100" },
    { label: "Appts today", value: data.appointments.today, sub: `${data.appointments.upcoming} upcoming`, icon: CalendarCheck, accent: "text-emerald-600 bg-emerald-50", ring: "ring-emerald-100" },
    { label: "Contacts", value: data.contacts.total, sub: "in CRM", icon: Users, accent: "text-amber-600 bg-amber-50", ring: "ring-amber-100" },
    { label: "SMS sent (7d)", value: data.sms.sentLast7, sub: `${data.sms.suppressedLast7} STOP-suppressed`, icon: MessageSquare, accent: "text-cyan-600 bg-cyan-50", ring: "ring-cyan-100" },
    { label: "AI turns (7d)", value: data.ai.turnsLast7, sub: fmtCost(data.ai.costMicroUsdLast7), icon: Cpu, accent: "text-zinc-600 bg-zinc-100", ring: "ring-zinc-200" },
  ];

  const outcomeRows = Object.entries(data.calls.byOutcome).map(([k, v]) => ({ k, v })) as { k: string; v: number }[];
  const urgencyRows = Object.entries(data.leads.byUrgency).map(([k, v]) => ({ k, v })) as { k: string; v: number }[];
  const apptStatusRows = Object.entries(data.appointments.byStatus).map(([k, v]) => ({ k, v })) as { k: string; v: number }[];

  const activities: any[] = data.activity ?? [];
  const upcoming: any[] = data.upcoming ?? [];

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="shadow-sm ring-1 ring-inset ring-zinc-100/60 hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{k.label}</span>
                  <div className={`h-7 w-7 rounded-md flex items-center justify-center ${k.accent}`}><Icon className="h-3.5 w-3.5" /></div>
                </div>
                <div className="text-2xl font-semibold tabular-nums leading-none">{k.value}</div>
                <div className="text-[11px] text-muted-foreground mt-1.5 truncate">{k.sub}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Breakdown row */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-muted-foreground" /> Call outcomes</CardTitle></CardHeader>
          <CardContent className="space-y-2.5">
            {outcomeRows.length === 0 && <p className="text-xs text-muted-foreground">No calls yet.</p>}
            {outcomeRows.map((r) => (
              <div key={r.k} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground capitalize">{r.k.toLowerCase()}</span>
                <span className="font-medium tabular-nums">{r.v}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-muted-foreground" /> Leads by urgency</CardTitle></CardHeader>
          <CardContent className="space-y-2.5">
            {urgencyRows.length === 0 && <p className="text-xs text-muted-foreground">No leads yet.</p>}
            {urgencyRows.map((r) => (
              <div key={r.k} className="flex items-center justify-between text-sm">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.k === "EMERGENCY" ? "bg-red-100 text-red-700" : r.k === "URGENT" ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-600"}`}>{r.k.toLowerCase()}</span>
                <span className="font-medium tabular-nums">{r.v}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><CalendarCheck className="h-4 w-4 text-muted-foreground" /> Appointments by status</CardTitle></CardHeader>
          <CardContent className="space-y-2.5">
            {apptStatusRows.length === 0 && <p className="text-xs text-muted-foreground">No appointments yet.</p>}
            {apptStatusRows.map((r) => (
              <div key={r.k} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground capitalize">{r.k.toLowerCase()}</span>
                <span className="font-medium tabular-nums">{r.v}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Activity timeline + Today's schedule — fills the empty space */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Recent activity timeline (spans 2 cols) */}
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-muted-foreground" /> Recent activity</CardTitle>
            <Badge variant="outline" className="text-[10px] text-muted-foreground font-normal">{activities.length} events</Badge>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="h-10 w-10 rounded-full bg-zinc-100 flex items-center justify-center mb-2"><Activity className="h-4 w-4 text-muted-foreground" /></div>
                <p className="text-sm text-muted-foreground">No activity yet. Simulate a call to see events here.</p>
              </div>
            ) : (
              <ol className="space-y-1">
                {activities.map((a, i) => {
                  const meta = activityMeta(a);
                  const Icon = meta.icon;
                  return (
                    <li key={`${a.kind}-${a.id}`} className="relative flex gap-3 group">
                      {/* timeline rail */}
                      {i < activities.length - 1 && <span className="absolute left-[15px] top-7 bottom-0 w-px bg-zinc-200 group-last:bg-transparent" />}
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ring-2 ring-white ${meta.dot}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0 pb-3.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="text-sm font-medium truncate">{a.title}</div>
                          <div className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">{fmtRelative(a.ts)}</div>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground capitalize">{a.subtitle?.replace(/_/g, " ").toLowerCase()}</span>
                          <span className="text-zinc-300">·</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${meta.statusClass}`}>{(a.status || "—").replace(/_/g, " ").toLowerCase()}</span>
                          {a.urgency && a.urgency !== "ROUTINE" && (
                            <>
                              <span className="text-zinc-300">·</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${a.urgency === "EMERGENCY" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{a.urgency.toLowerCase()}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Today's schedule */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm flex items-center gap-2"><CalendarClock className="h-4 w-4 text-muted-foreground" /> Upcoming schedule</CardTitle>
            <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-200 bg-emerald-50 font-normal">{upcoming.length} next</Badge>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="h-10 w-10 rounded-full bg-zinc-100 flex items-center justify-center mb-2"><CalendarClock className="h-4 w-4 text-muted-foreground" /></div>
                <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
              </div>
            ) : (
              <ol className="space-y-2.5">
                {upcoming.map((a) => (
                  <li key={a.id} className="flex gap-3 p-2.5 rounded-lg hover:bg-zinc-50 transition-colors">
                    <div className="flex flex-col items-center justify-center px-2.5 py-1.5 rounded-md bg-emerald-50 text-emerald-700 min-w-[52px]">
                      <span className="text-[10px] font-medium uppercase">{new Date(a.startTime).toLocaleDateString("en-US", { month: "short" })}</span>
                      <span className="text-lg font-semibold leading-none">{new Date(a.startTime).getDate()}</span>
                      <span className="text-[10px] mt-0.5">{fmtTime(a.startTime)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{fmtService(a.serviceType)}</div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{a.contactName}</div>
                      {a.phone && <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{fmtPhone(a.phone)}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Safety guardrails banner (tightened) */}
      <Card className="shadow-sm border-emerald-200 bg-gradient-to-r from-emerald-50 to-white">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0"><Ban className="h-4 w-4 text-emerald-700" /></div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-emerald-900">Architectural guardrails enforced</div>
              <p className="text-xs text-emerald-800/80 mt-0.5 leading-relaxed">
                AI interprets — deterministic software controls every booking, transfer, and message. Out-of-area never books · double-booking prevented by transactional re-check · emergency keywords trigger immediate transfer · SMS STOP suppressed at the sender service.
              </p>
            </div>
            <div className="hidden sm:flex flex-wrap gap-1.5 justify-end max-w-[40%]">
              {["Tenancy", "Zod tools", "Append-only audit", "Safe degradation"].map((g) => (
                <span key={g} className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-emerald-200 text-emerald-800 whitespace-nowrap">{g}</span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function activityMeta(a: any): { icon: React.ComponentType<{ className?: string }>; dot: string; statusClass: string } {
  const st = fmtStatus(a.status);
  if (a.kind === "call") {
    return { icon: a.status === "MISSED" ? PhoneOff : PhoneIncoming, dot: a.status === "MISSED" ? "bg-red-100 text-red-600" : a.status === "TRANSFERRED" ? "bg-amber-100 text-amber-600" : "bg-sky-100 text-sky-600", statusClass: st.className };
  }
  if (a.kind === "lead") {
    return { icon: UserPlus, dot: "bg-violet-100 text-violet-600", statusClass: st.className };
  }
  // appointment
  return { icon: CalendarCheck, dot: "bg-emerald-100 text-emerald-600", statusClass: st.className };
}
