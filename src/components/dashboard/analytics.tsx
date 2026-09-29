"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtCost, fmtService } from "./format";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Area, AreaChart, Cell } from "recharts";
import { BarChart3, TrendingUp, Cpu, Activity, CalendarCheck, MessageSquare } from "lucide-react";

const CHART_HEIGHT = 180;
const X_TICK = { fontSize: 9, fill: "#71717a" };
const Y_TICK = { fontSize: 10, fill: "#71717a" };
const TOOLTIP_STYLE = { fontSize: 11, borderRadius: 8, border: "1px solid #e4e4e7", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" };
const LEGEND_STYLE = { fontSize: 10, paddingTop: 4 };

export function Analytics() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const d = await api.analytics().catch((e) => { setError(e.message); return null; });
      setData(d); setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-muted-foreground text-sm">Loading analytics…</div>;
  if (error || !data) return <div className="text-destructive text-sm">{error ?? "Failed to load"}</div>;

  const totalAiCostUsd = (data.totals.aiCostMicroUsd14d ?? 0) / 1_000_000;
  const costDisplay = totalAiCostUsd === 0 ? "$0.00" : fmtCost(data.totals.aiCostMicroUsd14d);

  return (
    <div className="space-y-5">
      {/* Totals strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={Activity} label="Calls (14d)" value={data.totals.calls14d} accent="text-sky-600 bg-sky-50" />
        <Stat icon={TrendingUp} label="Leads (14d)" value={data.totals.leads14d} accent="text-violet-600 bg-violet-50" />
        <Stat icon={CalendarCheck} label="Appointments (14d)" value={data.totals.appts14d} accent="text-emerald-600 bg-emerald-50" />
        <Stat icon={Cpu} label="AI cost (14d)" value={costDisplay} accent="text-zinc-600 bg-zinc-100" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Calls per day</CardTitle>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <LegendDot color="#10b981" /> Completed <LegendDot color="#ef4444" /> Missed <LegendDot color="#a855f7" /> Voicemail <LegendDot color="#f59e0b" /> Transferred
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart data={data.callsByDay} margin={{ top: 5, right: 8, left: -18, bottom: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                <XAxis dataKey="label" tick={X_TICK} interval={0} angle={-35} textAnchor="end" height={36} />
                <YAxis tick={Y_TICK} allowDecimals={false} width={28} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                <Bar dataKey="completed" stackId="a" fill="#10b981" name="Completed" />
                <Bar dataKey="missed" stackId="a" fill="#ef4444" name="Missed" />
                <Bar dataKey="voicemail" stackId="a" fill="#a855f7" name="Voicemail" />
                <Bar dataKey="transferred" stackId="a" fill="#f59e0b" name="Transferred" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Leads per day (by urgency)</CardTitle>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <LegendDot color="#71717a" /> Routine <LegendDot color="#f59e0b" /> Urgent <LegendDot color="#ef4444" /> Emergency
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart data={data.leadsByDay} margin={{ top: 5, right: 8, left: -18, bottom: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                <XAxis dataKey="label" tick={X_TICK} interval={0} angle={-35} textAnchor="end" height={36} />
                <YAxis tick={Y_TICK} allowDecimals={false} width={28} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                <Bar dataKey="routine" stackId="a" fill="#71717a" name="Routine" />
                <Bar dataKey="urgent" stackId="a" fill="#f59e0b" name="Urgent" />
                <Bar dataKey="emergency" stackId="a" fill="#ef4444" name="Emergency" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Appointments per day</CardTitle>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <LegendDot color="#10b981" /> Confirmed <LegendDot color="#3b82f6" /> Requested <LegendDot color="#a1a1aa" /> Cancelled
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart data={data.apptsByDay} margin={{ top: 5, right: 8, left: -18, bottom: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                <XAxis dataKey="label" tick={X_TICK} interval={0} angle={-35} textAnchor="end" height={36} />
                <YAxis tick={Y_TICK} allowDecimals={false} width={28} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                <Bar dataKey="confirmed" stackId="a" fill="#10b981" name="Confirmed" />
                <Bar dataKey="requested" stackId="a" fill="#3b82f6" name="Requested" />
                <Bar dataKey="cancelled" stackId="a" fill="#a1a1aa" name="Cancelled" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">AI usage &amp; latency per day</CardTitle>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <LegendDot color="#10b981" /> Turns <LegendDot color="#f59e0b" /> Avg latency
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <AreaChart data={data.aiByDay} margin={{ top: 5, right: 8, left: -18, bottom: -10 }}>
                <defs>
                  <linearGradient id="turnsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                <XAxis dataKey="label" tick={X_TICK} interval={0} angle={-35} textAnchor="end" height={36} />
                <YAxis tick={Y_TICK} allowDecimals={false} width={28} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                <Area type="monotone" dataKey="turns" stroke="#10b981" strokeWidth={1.5} fill="url(#turnsGrad)" name="AI turns" />
                <Line type="monotone" dataKey="avgLatencyMs" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="Avg latency (ms)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Service-type breakdown + AI cost trend */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Service-type breakdown (30d)</CardTitle></CardHeader>
          <CardContent>
            {data.byServiceType.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center mb-2"><BarChart3 className="h-4 w-4 text-muted-foreground" /></div>
                <p className="text-xs text-muted-foreground">No appointments in the last 30 days.</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.byServiceType.map((s: any) => (
                  <div key={s.serviceType} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-50 border border-zinc-200">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-sm font-medium">{fmtService(s.serviceType)}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{s.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Cpu className="h-3.5 w-3.5 text-muted-foreground" /> AI cost (14d)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">{costDisplay}</div>
            <div className="text-xs text-muted-foreground mt-1">{data.totals.aiTurns14d} turns · MockProvider is free</div>
            <div className="mt-3 pt-3 border-t space-y-1.5 text-xs">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Avg tokens / turn</span><span className="tabular-nums font-mono">{data.totals.aiTurns14d ? Math.round(data.aiByDay.reduce((s: number, d: any) => s + d.inputTokens + d.outputTokens, 0) / Math.max(1, data.totals.aiTurns14d)) : 0}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Avg latency</span><span className="tabular-nums font-mono">{data.totals.aiTurns14d ? Math.round(data.aiByDay.reduce((s: number, d: any) => s + d.avgLatencyMs, 0) / Math.max(1, data.totals.aiTurns14d)) : 0}ms</span></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; accent: string }) {
  return (
    <Card className="shadow-sm ring-1 ring-inset ring-zinc-100/60">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
          <div className={`h-7 w-7 rounded-md flex items-center justify-center ${accent}`}><Icon className="h-3.5 w-3.5" /></div>
        </div>
        <div className="text-xl font-semibold tabular-nums leading-none">{value}</div>
      </CardContent>
    </Card>
  );
}

function LegendDot({ color }: { color: string }) {
  return <span className="inline-block h-2 w-2 rounded-full align-middle mr-0.5" style={{ backgroundColor: color }} />;
}
