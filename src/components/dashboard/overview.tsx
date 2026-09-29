"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDateShort, fmtCost } from "./format";
import { Phone, PhoneOff, CalendarCheck, Users, MessageSquare, Ban, Cpu, TrendingUp, Activity } from "lucide-react";

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
    { label: "Calls (7d)", value: data.calls.last7, sub: `${data.calls.missedLast7} missed`, icon: Phone, accent: "text-sky-600 bg-sky-50" },
    { label: "Leads (new)", value: data.leads.new, sub: `${data.leads.total} total`, icon: Users, accent: "text-violet-600 bg-violet-50" },
    { label: "Appts today", value: data.appointments.today, sub: `${data.appointments.upcoming} upcoming`, icon: CalendarCheck, accent: "text-emerald-600 bg-emerald-50" },
    { label: "Contacts", value: data.contacts.total, sub: "in CRM", icon: Users, accent: "text-amber-600 bg-amber-50" },
    { label: "SMS sent (7d)", value: data.sms.sentLast7, sub: `${data.sms.suppressedLast7} STOP-suppressed`, icon: MessageSquare, accent: "text-cyan-600 bg-cyan-50" },
    { label: "AI turns (7d)", value: data.ai.turnsLast7, sub: `${fmtCost(data.ai.costMicroUsdLast7)} cost`, icon: Cpu, accent: "text-zinc-600 bg-zinc-100" },
  ];

  const outcomeRows = Object.entries(data.calls.byOutcome).map(([k, v]) => ({ k, v })) as { k: string; v: number }[];
  const urgencyRows = Object.entries(data.leads.byUrgency).map(([k, v]) => ({ k, v })) as { k: string; v: number }[];
  const apptStatusRows = Object.entries(data.appointments.byStatus).map(([k, v]) => ({ k, v })) as { k: string; v: number }[];

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{k.label}</span>
                  <div className={`h-7 w-7 rounded-md flex items-center justify-center ${k.accent}`}><Icon className="h-3.5 w-3.5" /></div>
                </div>
                <div className="text-2xl font-semibold tabular-nums">{k.value}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Call outcomes */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-muted-foreground" /> Call outcomes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {outcomeRows.length === 0 && <p className="text-xs text-muted-foreground">No calls yet.</p>}
            {outcomeRows.map((r) => (
              <div key={r.k} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground capitalize">{r.k.toLowerCase()}</span>
                <span className="font-medium tabular-nums">{r.v}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Lead urgency */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-muted-foreground" /> Leads by urgency</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {urgencyRows.length === 0 && <p className="text-xs text-muted-foreground">No leads yet.</p>}
            {urgencyRows.map((r) => (
              <div key={r.k} className="flex items-center justify-between text-sm">
                <span className={`px-2 py-0.5 rounded text-xs ${r.k === "EMERGENCY" ? "bg-red-100 text-red-700" : r.k === "URGENT" ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-600"}`}>{r.k.toLowerCase()}</span>
                <span className="font-medium tabular-nums">{r.v}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Appointment status */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><CalendarCheck className="h-4 w-4 text-muted-foreground" /> Appointments by status</CardTitle></CardHeader>
          <CardContent className="space-y-2">
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

      {/* Safety guardrails banner */}
      <Card className="shadow-sm border-emerald-200 bg-emerald-50/50">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0"><Ban className="h-4 w-4 text-emerald-700" /></div>
            <div>
              <div className="font-medium text-sm text-emerald-900">Architectural guardrails enforced</div>
              <p className="text-xs text-emerald-800/80 mt-1 leading-relaxed">
                AI interprets conversations — deterministic software controls every booking, transfer, and message. Out-of-area never books. Double-booking is prevented by a transactional re-check. Emergency keywords trigger immediate transfer. SMS STOP is suppressed at the sender service.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {["Tenancy isolation", "Zod-validated tools", "Append-only audit", "Safe degradation"].map((g) => (
                  <span key={g} className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-emerald-200 text-emerald-800">{g}</span>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
