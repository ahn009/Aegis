"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { fmtDateShort, fmtPhone, fmtService, fmtStatus } from "./format";
import { Check, X, CalendarClock, RefreshCw, ChevronRight, Clock, MapPin, User, Phone } from "lucide-react";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const daysAhead = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

export function Appointments() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [from, setFrom] = useState<string>(daysAgo(30));
  const [to, setTo] = useState<string>(daysAhead(14));
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const r = await api.appointments({ limit: 100, ...(status ? { status } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }).catch(() => ({ items: [], total: 0 }));
    setItems(r.items); setTotal(r.total); setLoading(false);
  }
  useEffect(() => { load(); }, [status, from, to]);

  async function confirm(id: string) {
    setBusy(true);
    await api.confirmAppt(id).catch(() => {});
    setBusy(false);
    load();
    if (detail?.id === id) {
      const d = await api.apptDetail(id).catch(() => null);
      if (d) setDetail(d);
    }
  }
  async function doCancel() {
    if (!cancelTarget) return;
    setBusy(true);
    await api.cancelAppt(cancelTarget.id, cancelReason || "Cancelled by staff").catch(() => {});
    setBusy(false);
    setCancelTarget(null);
    setCancelReason("");
    load();
    if (detail?.id === cancelTarget.id) setDetail({ ...detail, status: "CANCELLED" });
  }

  async function openDetail(a: any) {
    setDetail(a); setDetailLoading(true);
    const d = await api.apptDetail(a.id).catch(() => null);
    setDetailLoading(false);
    if (d) setDetail(d);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {["", "CONFIRMED", "REQUESTED", "COMPLETED", "CANCELLED"].map((s) => (
          <Button key={s} variant={status === s ? "default" : "outline"} size="sm" onClick={() => setStatus(s)} className="h-8 text-xs">{s || "All"}</Button>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-muted-foreground">From</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[140px] text-xs" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-[140px] text-xs" />
        </div>
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
                  <tr key={a.id} className="border-b last:border-0 hover:bg-zinc-50 cursor-pointer group" onClick={() => openDetail(a)}>
                    <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded text-xs border ${st.className}`}>{st.label}</span></td>
                    <td className="px-4 py-2.5 text-xs font-medium">{fmtService(a.serviceType)}</td>
                    <td className="px-4 py-2.5">{a.contact?.name ?? <span className="text-muted-foreground text-xs">—</span>} <span className="text-xs text-muted-foreground">{fmtPhone(a.contact?.phoneE164)}</span></td>
                    <td className="px-4 py-2.5 text-xs">{fmtDateShort(a.startTime)}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.holdUntil ? fmtDateShort(a.holdUntil) : "—"}</td>
                    <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      {a.status === "REQUESTED" && <Button size="sm" variant="outline" className="h-7 text-xs mr-1" onClick={() => confirm(a.id)} disabled={busy}><Check className="h-3 w-3 mr-1" />Confirm</Button>}
                      {(a.status === "CONFIRMED" || a.status === "REQUESTED") && <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700" onClick={() => setCancelTarget(a)} disabled={busy}><X className="h-3 w-3 mr-1" />Cancel</Button>}
                      <ChevronRight className="h-3.5 w-3.5 text-zinc-300 inline-block ml-1 group-hover:text-zinc-500" />
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">{loading ? "Loading…" : <span className="inline-flex items-center gap-2"><CalendarClock className="h-4 w-4" />No appointments in this range.</span>}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail Sheet */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detail ? fmtService(detail.serviceType) : "Appointment"}</SheetTitle>
            <SheetDescription>{detail ? fmtDateShort(detail.startTime) : ""}</SheetDescription>
          </SheetHeader>
          {detailLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading detail…</div>
          ) : detail ? (
            <div className="space-y-4 mt-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Status:</span>
                {(() => { const st = fmtStatus(detail.status); return <span className={`px-2 py-0.5 rounded text-xs border ${st.className}`}>{st.label}</span>; })()}
              </div>

              <DetailRow icon={Clock} label="Window" value={`${fmtDateShort(detail.startTime)} → ${fmtDateShort(detail.endTime)}`} />
              {detail.holdUntil && <DetailRow icon={Clock} label="Hold expires" value={fmtDateShort(detail.holdUntil)} />}

              {detail.contact && (
                <div className="border-t pt-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Contact</div>
                  <div className="space-y-1.5 text-sm">
                    <DetailRow icon={User} label="Name" value={detail.contact.name ?? "—"} />
                    <DetailRow icon={Phone} label="Phone" value={fmtPhone(detail.contact.phoneE164)} />
                    {detail.contact.addressZip && <DetailRow icon={MapPin} label="Address" value={[detail.contact.addressStreet, detail.contact.addressCity, detail.contact.addressState, detail.contact.addressZip].filter(Boolean).join(", ")} />}
                  </div>
                </div>
              )}

              {detail.notes && (
                <div className="border-t pt-3">
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">Notes</div>
                  <div className="text-sm bg-muted/50 rounded p-2.5 whitespace-pre-wrap">{detail.notes}</div>
                </div>
              )}

              {detail.call?.conversation && (
                <div className="border-t pt-3">
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">Originating call</div>
                  <div className="text-xs font-mono text-muted-foreground">CallSid: {detail.call.callSid?.slice(0, 20)}…</div>
                  <div className="text-xs mt-1">Conversation state: <span className="font-medium">{detail.call.conversation.state.replace(/_/g, " ")}</span>{detail.call.conversation.outcome ? ` · outcome: ${detail.call.conversation.outcome}` : ""}</div>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t">
                {detail.status === "REQUESTED" && <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => confirm(detail.id)} disabled={busy}><Check className="h-3.5 w-3.5 mr-1.5" />Confirm</Button>}
                {(detail.status === "CONFIRMED" || detail.status === "REQUESTED") && <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300" onClick={() => setCancelTarget(detail)} disabled={busy}><X className="h-3.5 w-3.5 mr-1.5" />Cancel</Button>}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

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

function DetailRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="font-medium">{value}</div>
      </div>
    </div>
  );
}
