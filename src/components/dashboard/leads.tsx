"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtDateShort, fmtPhone, fmtService, fmtUrgency, fmtStatus } from "./format";
import { RefreshCw, UserPlus } from "lucide-react";

export function Leads() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");

  async function load() {
    setLoading(true);
    const r = await api.leads({ limit: 100, ...(status ? { status } : {}) }).catch(() => ({ items: [], total: 0 }));
    setItems(r.items); setTotal(r.total); setLoading(false);
  }
  useEffect(() => { load(); }, [status]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {["", "NEW", "CONTACTED", "BOOKED", "LOST"].map((s) => (
          <Button key={s} variant={status === s ? "default" : "outline"} size="sm" onClick={() => setStatus(s)} className="h-8 text-xs">
            {s || "All"}
          </Button>
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
              </tr>
            </thead>
            <tbody>
              {items.map((l) => {
                const ug = fmtUrgency(l.urgency);
                const st = fmtStatus(l.status);
                return (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-zinc-50">
                    <td className="px-4 py-2.5 font-medium">{l.name ?? <span className="text-muted-foreground italic">Unknown</span>}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{fmtPhone(l.phoneE164)}</td>
                    <td className="px-4 py-2.5 text-xs">{fmtService(l.serviceType)}</td>
                    <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded text-xs border ${ug.className}`}>{ug.label}</span></td>
                    <td className="px-4 py-2.5">{l.inServiceArea === null ? <span className="text-muted-foreground text-xs">—</span> : l.inServiceArea ? <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 text-xs">In area</Badge> : <Badge variant="outline" className="text-red-700 border-red-200 bg-red-50 text-xs">Out</Badge>}</td>
                    <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded text-xs border ${st.className}`}>{st.label}</span></td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{l.source}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDateShort(l.createdAt)}</td>
                  </tr>
                );
              })}
              {items.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground text-sm">{loading ? "Loading…" : <span className="inline-flex items-center gap-2"><UserPlus className="h-4 w-4" />No leads yet.</span>}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
