"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { fmtDateShort, fmtPhone, fmtService, fmtStatus } from "./format";
import { Check, X, CalendarClock, RefreshCw } from "lucide-react";

export function Appointments() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const r = await api.appointments({ limit: 100, ...(status ? { status } : {}) }).catch(() => ({ items: [], total: 0 }));
    setItems(r.items); setTotal(r.total); setLoading(false);
  }
  useEffect(() => { load(); }, [status]);

  async function confirm(id: string) {
    setBusy(true);
    await api.confirmAppt(id).catch(() => {});
    setBusy(false);
    load();
  }
  async function doCancel() {
    if (!cancelTarget) return;
    setBusy(true);
    await api.cancelAppt(cancelTarget.id, cancelReason || "Cancelled by staff").catch(() => {});
    setBusy(false);
    setCancelTarget(null);
    setCancelReason("");
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {["", "CONFIRMED", "REQUESTED", "COMPLETED", "CANCELLED"].map((s) => (
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
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="text-left font-medium px-4 py-2.5">Service</th>
                <th className="text-left font-medium px-4 py-2.5">Contact</th>
                <th className="text-left font-medium px-4 py-2.5">When</th>
                <th className="text-left font-medium px-4 py-2.5">Hold until</th>
                <th className="text-right font-medium px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const st = fmtStatus(a.status);
                return (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-zinc-50">
                    <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded text-xs border ${st.className}`}>{st.label}</span></td>
                    <td className="px-4 py-2.5 text-xs">{fmtService(a.serviceType)}</td>
                    <td className="px-4 py-2.5">{a.contact?.name ?? <span className="text-muted-foreground text-xs">—</span>} <span className="text-xs text-muted-foreground">{fmtPhone(a.contact?.phoneE164)}</span></td>
                    <td className="px-4 py-2.5 text-xs">{fmtDateShort(a.startTime)}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.holdUntil ? fmtDateShort(a.holdUntil) : "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      {a.status === "REQUESTED" && <Button size="sm" variant="outline" className="h-7 text-xs mr-1" onClick={() => confirm(a.id)} disabled={busy}><Check className="h-3 w-3 mr-1" />Confirm</Button>}
                      {(a.status === "CONFIRMED" || a.status === "REQUESTED") && <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700" onClick={() => setCancelTarget(a)} disabled={busy}><X className="h-3 w-3 mr-1" />Cancel</Button>}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">{loading ? "Loading…" : <span className="inline-flex items-center gap-2"><CalendarClock className="h-4 w-4" />No appointments.</span>}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel appointment</DialogTitle>
            <DialogDescription>{fmtService(cancelTarget?.serviceType)} for {cancelTarget?.contact?.name ?? "—"} on {fmtDateShort(cancelTarget?.startTime)}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="e.g. Customer rescheduled, duplicate, etc." rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Keep</Button>
            <Button variant="destructive" onClick={doCancel} disabled={busy}>Cancel appointment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
