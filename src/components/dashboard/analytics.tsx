"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtCost, fmtService } from "./format";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Area, AreaChart } from "recharts";
import { BarChart3, TrendingUp, Cpu, Activity } from "lucide-react";

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

  return (
    <div className="space-y-5">
      {/* Totals strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={Activity} label="Calls (14d)" value={data.totals.calls14d} accent="text-sky-600 bg-sky-50" />
        <Stat icon={TrendingUp} label="Leads (14d)" value={data.totals.leads14d} accent="text-violet-600 bg-violet-50" />
        <Stat icon={BarChart3} label="Appointments (14d)" value={data.totals.appts14d} accent="text-emerald-600 bg-emerald-50" />
        <Stat icon={Cpu} label="AI cost (14d)" value={fmtCost(data.totals.aiCostMicroUsd14d)} accent="text-zinc-600 bg-zinc-100" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Calls per day</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.callsByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="completed" stackId="a" fill="#10b981" name="Completed" radius={[0, 0, 0, 0]} />
                <Bar dataKey="missed" stackId="a" fill="#ef4444" name="Missed" />
                <Bar dataKey="voicemail" stackId="a" fill="#a855f7" name="Voicemail" />
                <Bar dataKey="transferred" stackId="a" fill="#f59e0b" name="Transferred" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Leads per day (by urgency)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.leadsByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="routine" stackId="a" fill="#71717a" name="Routine" />
                <Bar dataKey="urgent" stackId="a" fill="#f59e0b" name="Urgent" />
                <Bar dataKey="emergency" stackId="a" fill="#ef4444" name="Emergency" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Appointments per day</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.apptsByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="confirmed" stackId="a" fill="#10b981" name="Confirmed" />
                <Bar dataKey="requested" stackId="a" fill="#3b82f6" name="Requested" />
                <Bar dataKey="cancelled" stackId="a" fill="#a1a1aa" name="Cancelled" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm">AI usage &amp; cost per day</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.aiByDay}>
                <defs>
                  <linearGradient id="turnsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="turns" stroke="#10b981" fill="url(#turnsGrad)" name="AI turns" />
                <Line type="monotone" dataKey="avgLatencyMs" stroke="#f59e0b" name="Avg latency (ms)" yAxisId={0} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Service-type breakdown */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Service-type breakdown (30d)</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {data.byServiceType.length === 0 && <p className="text-xs text-muted-foreground">No appointments in the last 30 days.</p>}
            {data.byServiceType.map((s: any) => (
              <Badge key={s.serviceType} variant="outline" className="text-sm py-1.5 px-3 gap-1.5">
                {fmtService(s.serviceType)} <span className="tabular-nums text-muted-foreground">{s.count}</span>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; accent: string }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">{label}</span>
          <div className={`h-6 w-6 rounded flex items-center justify-center ${accent}`}><Icon className="h-3 w-3" /></div>
        </div>
        <div className="text-xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
