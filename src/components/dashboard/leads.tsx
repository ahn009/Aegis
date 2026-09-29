"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { fmtDateShort, fmtPhone, fmtService, fmtUrgency, fmtStatus } from "./format";
import { RefreshCw, UserPlus, ChevronDown, Check, Circle } from "lucide-react";

const STATUS_FLOW: { value: string; label: string; className: string; desc: string }[] = [
  { value: "NEW", label: "New", className: "bg-sky-100 text-sky-700 border-sky-200", desc: "Just received, not yet contacted" },
  { value: "CONTACTED", label: "Contacted", className: "bg-amber-100 text-amber-700 border-amber-200", desc: "Staff has reached out" },
  { value: "BOOKED", label: "Booked", className: "bg-emerald-100 text-emerald-700 border-emerald-200", desc: "Appointment scheduled" },
  { value: "LOST", label: "Lost", className: "bg-zinc-100 text-zinc-500 border-zinc-200", desc: "No longer pursuing" },
];

export function Leads() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const r = await api.leads({ limit: 100, ...(status ? { status } : {}) }).catch(() => ({ items: [], total: 0 }));
    setItems(r.items); setTotal(r.total); setLoading(false);
  }
  useEffect(() => { load(); }, [status]);

  async function updateStatus(id: string, newStatus: string) {
    setBusyId(id);
    try {
      await api.updateLeadStatus(id, newStatus);
      setToast(`Lead marked as ${newStatus.toLowerCase()}`);
      setTimeout(() => setToast(null), 2500);
      load();
    } catch (e) {
      setToast(`Error: ${(e as Error).message}`);
      setTimeout(() => setToast(null), 3500);
    }
    setBusyId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {["", "NEW", "CONTACTED", "BOOKED", "LOST"].map((s) => (
          <Button key={s} variant={status === s ? "default" : "outline"} size="sm" onClick={() => setStatus(s)} className="h-8 text-xs">{s || "All"}</Button>
        ))}
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-8"><RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
        <Badge variant="outline" className="text-xs">{total} total</Badge>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Name</th>
                <th className="text-left font-medium px-4 py-2.5">Phone</th>
                <th className="text-left font-medium px-4 py-2.5">Service</th>
                <th className="text-left font-medium px-4 py-2.5">Urgency</th>
                <th className="text-left font-medium px-4 py-2.5">Area</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="text-left font-medium px-4 py-2.5">Source</th>
                <th className="text-left font-medium px-4 py-2.5">Created</th>
                <th className="text-right font-medium px-4 py-2.5">Update</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => {
                const ug = fmtUrgency(l.urgency);
                const st = fmtStatus(l.status);
                const flow = STATUS_FLOW.find((s) => s.value === l.status) ?? STATUS_FLOW[0];
                return (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-zinc-50">
                    <td className="px-4 py-2.5 font-medium">{l.name ?? <span className="text-muted-foreground italic">Unknown</span>}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{fmtPhone(l.phoneE164)}</td>
                    <td className="px-4 py-2.5 text-xs">{fmtService(l.serviceType)}</td>
                    <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded text-xs border ${ug.className}`}>{ug.label}</span></td>
                    <td className="px-4 py-2.5">{l.inServiceArea === null ? <span className="text-muted-foreground text-xs">—</span> : l.inServiceArea ? <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 text-xs">In</Badge> : <Badge variant="outline" className="text-red-700 border-red-200 bg-red-50 text-xs">Out</Badge>}</td>
                    <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded text-xs border ${st.className}`}>{st.label}</span></td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{l.source}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDateShort(l.createdAt)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busyId === l.id}>
                            <Circle className={`h-2 w-2 mr-1.5 ${flow.value === "NEW" ? "text-sky-500" : flow.value === "CONTACTED" ? "text-amber-500" : flow.value === "BOOKED" ? "text-emerald-500" : "text-zinc-400"}`} />
                            {busyId === l.id ? "…" : "Update"}
                            <ChevronDown className="h-3 w-3 ml-1" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuLabel className="text-xs">Lead status</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {STATUS_FLOW.map((s) => (
                            <DropdownMenuItem key={s.value} onClick={() => updateStatus(l.id, s.value)} disabled={l.status === s.value} className="text-xs">
                              <span className={`h-1.5 w-1.5 rounded-full ${s.value === "NEW" ? "bg-sky-500" : s.value === "CONTACTED" ? "bg-amber-500" : s.value === "BOOKED" ? "bg-emerald-500" : "bg-zinc-400"}`} />
                              <span className="font-medium">{s.label}</span>
                              {l.status === s.value && <Check className="h-3 w-3 ml-auto text-emerald-600" />}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <div className="px-2 py-1.5 text-[10px] text-muted-foreground">{flow.desc}</div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground text-sm">{loading ? "Loading…" : <span className="inline-flex items-center gap-2"><UserPlus className="h-4 w-4" />No leads in this status.</span>}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-zinc-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}
    </div>
  );
}
