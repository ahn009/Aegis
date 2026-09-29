"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { fmtDateShort, fmtPhone, fmtService, fmtStatus, fmtUrgency } from "./format";
import { Search, RefreshCw, Users, ChevronRight, Phone, MapPin, Mail, User, CalendarClock, PhoneIncoming, UserPlus, CalendarCheck } from "lucide-react";

export function Contacts() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  function fetchItems() {
    return api.contacts({ limit: 100, search }).catch(() => ({ items: [], total: 0 }));
  }
  async function load() {
    setLoading(true);
    const r = await fetchItems();
    setItems(r.items); setTotal(r.total); setLoading(false);
  }
  useEffect(() => {
    let active = true;
    void fetchItems().then((r) => { if (active) { setItems(r.items); setTotal(r.total); setLoading(false); } });
    return () => { active = false; };
  }, [search]);

  async function openDetail(c: any) {
    setDetail(c); setDetailLoading(true);
    const d = await api.contact(c.id).catch(() => null);
    setDetailLoading(false);
    if (d) setDetail({ ...c, ...d });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name, phone, ZIP…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
        <Badge variant="outline" className="text-xs">{total} total</Badge>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Name</th>
                <th className="text-left font-medium px-4 py-2.5">Phone</th>
                <th className="text-left font-medium px-4 py-2.5">Address</th>
                <th className="text-left font-medium px-4 py-2.5">Created</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-zinc-50 cursor-pointer group" onClick={() => openDetail(c)}>
                  <td className="px-4 py-2.5 font-medium">{c.name ?? <span className="text-muted-foreground italic">Unknown</span>}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{fmtPhone(c.phoneE164)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{[c.addressStreet, c.addressCity, c.addressState, c.addressZip].filter(Boolean).join(", ") || "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDateShort(c.createdAt)}</td>
                  <td className="px-4 py-2.5 text-right"><ChevronRight className="h-3.5 w-3.5 text-zinc-300 group-hover:text-zinc-500" /></td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-sm">{loading ? "Loading…" : <span className="inline-flex items-center gap-2"><Users className="h-4 w-4" />No contacts found.</span>}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detail?.name ?? "Contact"}</SheetTitle>
            <SheetDescription>{fmtPhone(detail?.phoneE164)}</SheetDescription>
          </SheetHeader>
          {detailLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading detail…</div>
          ) : detail ? (
            <div className="space-y-4 mt-4">
              <div className="space-y-2 text-sm">
                {detail.email && <ContactRow icon={Mail} label="Email" value={detail.email} />}
                {detail.addressStreet && <ContactRow icon={MapPin} label="Address" value={[detail.addressStreet, detail.addressCity, detail.addressState, detail.addressZip].filter(Boolean).join(", ")} />}
                {detail.notes && <div className="text-xs bg-muted/50 rounded p-2.5 whitespace-pre-wrap">{detail.notes}</div>}
              </div>

              <Section icon={PhoneIncoming} title="Recent calls" count={detail.calls?.length}>
                {detail.calls?.map((c: any) => {
                  const st = fmtStatus(c.status);
                  const ug = c.urgency !== "ROUTINE" ? fmtUrgency(c.urgency) : null;
                  return (
                    <div key={c.id} className="flex items-center justify-between text-xs px-2.5 py-2 rounded hover:bg-zinc-50">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] border ${st.className}`}>{st.label}</span>
                        {ug && <span className={`px-1.5 py-0.5 rounded text-[10px] border ${ug.className}`}>{ug.label}</span>}
                        <span className="text-muted-foreground truncate">{fmtService(c.serviceType)}</span>
                      </div>
                      <span className="text-muted-foreground tabular-nums whitespace-nowrap">{fmtDateShort(c.startedAt)}</span>
                    </div>
                  );
                })}
              </Section>

              <Section icon={UserPlus} title="Leads" count={detail.leads?.length}>
                {detail.leads?.map((l: any) => {
                  const st = fmtStatus(l.status);
                  return (
                    <div key={l.id} className="flex items-center justify-between text-xs px-2.5 py-2 rounded hover:bg-zinc-50">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] border ${st.className}`}>{st.label}</span>
                        <span className="text-muted-foreground truncate">{fmtService(l.serviceType)}</span>
                      </div>
                      <span className="text-muted-foreground tabular-nums whitespace-nowrap">{fmtDateShort(l.createdAt)}</span>
                    </div>
                  );
                })}
              </Section>

              <Section icon={CalendarCheck} title="Appointments" count={detail.appointments?.length}>
                {detail.appointments?.map((a: any) => {
                  const st = fmtStatus(a.status);
                  return (
                    <div key={a.id} className="flex items-center justify-between text-xs px-2.5 py-2 rounded hover:bg-zinc-50">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] border ${st.className}`}>{st.label}</span>
                        <span className="text-muted-foreground truncate">{fmtService(a.serviceType)}</span>
                      </div>
                      <span className="text-muted-foreground tabular-nums whitespace-nowrap">{fmtDateShort(a.startTime)}</span>
                    </div>
                  );
                })}
              </Section>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ContactRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="font-medium">{value}</div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, count, children }: { icon: React.ComponentType<{ className?: string }>; title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="border-t pt-3">
      <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" /> {title}
        {count !== undefined && <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-1">{count}</Badge>}
      </div>
      <div className="space-y-0.5">
        {children}
      </div>
    </div>
  );
}
