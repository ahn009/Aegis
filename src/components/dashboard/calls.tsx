"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fmtDateShort, fmtPhone, fmtService, fmtStatus, fmtState, fmtUrgency } from "./format";
import { Search, RefreshCw, PhoneIncoming, PhoneMissed, PhoneForwarded, Voicemail } from "lucide-react";

export function Calls() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [selected, setSelected] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    const params: Record<string, string | number> = { limit: 100 };
    if (statusFilter) params.status = statusFilter;
    if (from) params.from = new Date(from).toISOString();
    if (to) params.to = new Date(`${to}T23:59:59`).toISOString();
    const r = await api.calls(params).catch(() => ({ items: [], total: 0 }));
    setItems(r.items); setTotal(r.total); setLoading(false);
  }
  useEffect(() => { load(); }, [statusFilter, from, to]);

  async function open(c: any) {
    setSelected(c);
    setDetail(null);
    const d = await api.call(c.id).catch(() => null);
    setDetail(d);
  }

  const filtered = items.filter((c) => !search || c.callSid.includes(search) || (c.fromPhone ?? "").includes(search) || (c.contact?.name ?? "").toLowerCase().includes(search.toLowerCase()));

  function statusIcon(s: string) {
    if (s === "MISSED") return <PhoneMissed className="h-3.5 w-3.5 text-red-500" />;
    if (s === "VOICEMAIL") return <Voicemail className="h-3.5 w-3.5 text-purple-500" />;
    if (s === "TRANSFERRED") return <PhoneForwarded className="h-3.5 w-3.5 text-amber-500" />;
    return <PhoneIncoming className="h-3.5 w-3.5 text-sky-500" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search CallSid, phone, name…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="">All statuses</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="MISSED">Missed</option>
          <option value="VOICEMAIL">Voicemail</option>
          <option value="TRANSFERRED">Transferred</option>
          <option value="FAILED">Failed</option>
        </select>
        <div className="flex items-center gap-1.5">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[140px] text-xs" aria-label="From date" />
          <span className="text-xs text-muted-foreground">→</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[140px] text-xs" aria-label="To date" />
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
        <Badge variant="outline" className="text-xs">{total} total</Badge>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="text-left font-medium px-4 py-2.5">From</th>
                <th className="text-left font-medium px-4 py-2.5">Contact</th>
                <th className="text-left font-medium px-4 py-2.5">Service</th>
                <th className="text-left font-medium px-4 py-2.5">Urgency</th>
                <th className="text-left font-medium px-4 py-2.5">Started</th>
                <th className="text-left font-medium px-4 py-2.5">Duration</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const st = fmtStatus(c.status);
                const ug = fmtUrgency(c.urgency);
                return (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-zinc-50 cursor-pointer" onClick={() => open(c)}>
                    <td className="px-4 py-2.5"><span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border ${st.className}`}>{statusIcon(c.status)}{st.label}</span></td>
                    <td className="px-4 py-2.5 font-mono text-xs">{fmtPhone(c.fromPhone)}</td>
                    <td className="px-4 py-2.5">{c.contact?.name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-2.5 text-xs">{fmtService(c.serviceType)}</td>
                    <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded text-xs border ${ug.className}`}>{ug.label}</span></td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDateShort(c.startedAt)}</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums">{c.durationSeconds ? `${Math.floor(c.durationSeconds / 60)}m ${c.durationSeconds % 60}s` : "—"}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground text-sm">{loading ? "Loading…" : "No calls found."}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Call {selected?.callSid.slice(0, 14)}…</SheetTitle>
            <SheetDescription>Inbound call from {fmtPhone(selected?.fromPhone)}</SheetDescription>
          </SheetHeader>
          {detail && <CallDetail detail={detail} />}
          {!detail && <div className="p-8 text-center text-sm text-muted-foreground">Loading conversation…</div>}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CallDetail({ detail }: { detail: any }) {
  const conv = detail.conversation;
  const st = fmtStatus(detail.status);
  const ug = fmtUrgency(detail.urgency);
  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><div className="text-xs text-muted-foreground">Status</div><span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs border ${st.className}`}>{st.label}</span></div>
        <div><div className="text-xs text-muted-foreground">Urgency</div><span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs border ${ug.className}`}>{ug.label}</span></div>
        <div><div className="text-xs text-muted-foreground">Contact</div><div className="mt-1">{detail.contact?.name ?? "—"} <span className="text-xs text-muted-foreground">{fmtPhone(detail.contact?.phoneE164)}</span></div></div>
        <div><div className="text-xs text-muted-foreground">Service</div><div className="mt-1">{fmtService(detail.serviceType)}</div></div>
      </div>

      {conv && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Conversation state:</span>
            {(() => { const s = fmtState(conv.state); return <Badge variant="outline" className={s.className}>{s.label}</Badge>; })()}
            {conv.outcome && <Badge variant="secondary" className="text-xs">outcome: {conv.outcome}</Badge>}
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Transcript</div>
            <ScrollArea className="h-72 rounded-md border bg-zinc-50">
              <div className="p-3 space-y-2.5">
                {conv.messages?.map((m: any) => (
                  <div key={m.id} className={`flex ${m.role === "caller" ? "justify-start" : m.role === "assistant" ? "justify-end" : "justify-center"}`}>
                    <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-xs ${
                      m.role === "caller" ? "bg-white border" :
                      m.role === "assistant" ? "bg-zinc-900 text-white" :
                      m.role === "tool" ? "bg-amber-50 border border-amber-200 font-mono text-[10px]" :
                      "bg-muted text-muted-foreground text-[10px]"
                    }`}>
                      {m.role === "tool" ? <span className="text-amber-700">🔧 {m.content}</span> : m.content}
                    </div>
                  </div>
                ))}
                {conv.messages?.length === 0 && <div className="text-center text-xs text-muted-foreground py-4">No messages.</div>}
              </div>
            </ScrollArea>
          </div>

          {conv.turns && conv.turns.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">AI turns ({conv.turns.length})</div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {conv.turns.map((t: any) => (
                  <div key={t.id} className="text-[11px] bg-muted/50 rounded px-2.5 py-1.5 font-mono flex items-center justify-between">
                    <span>#{t.turnIndex} {t.provider}/{t.model}</span>
                    <span className="text-muted-foreground">{t.inputTokens}+{t.outputTokens} tok · {t.latencyMs}ms</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
