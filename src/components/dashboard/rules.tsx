"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "./format";
import {
  BookOpen, CheckCircle2, FileText, Clock, MapPin, AlertTriangle, PhoneForwarded,
  ShieldAlert, Moon, Globe, Hash,
} from "lucide-react";

const RULE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; desc: string }> = {
  service_area: { label: "Service Area", icon: MapPin, desc: "ZIP/city lists — out-of-area never books" },
  business_hours: { label: "Business Hours", icon: Clock, desc: "Open/close per weekday + buffer (DST-aware)" },
  holidays: { label: "Holidays", icon: FileText, desc: "Closed dates that override business hours" },
  after_hours: { label: "After Hours", icon: Moon, desc: "Closed behavior: voicemail / transfer / ai_intake" },
  escalation_routing: { label: "Escalation Routing", icon: AlertTriangle, desc: "Emergency keywords → transfer; urgent keywords" },
  missed_call_recovery: { label: "Missed Call Recovery", icon: PhoneForwarded, desc: "Text-back cap: 1 per caller per 4h, permitted hours" },
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function Rules() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const r = await api.rules().catch(() => ({ items: [], ruleTypes: [] }));
    setItems(r.items); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function publish(id: string) {
    setBusy(id);
    await api.publishRule(id).catch(() => {});
    setBusy(null);
    load();
  }

  const byType: Record<string, any[]> = {};
  for (const it of items) (byType[it.ruleType] ??= []).push(it);

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border-blue-100 bg-blue-50/40">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <BookOpen className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-900 leading-relaxed">
              Business rules are <strong>versioned</strong> (DRAFT → PUBLISH) and <strong>immutable on publish</strong>. The AI <strong>never</strong> evaluates these — only the deterministic engine does. Point-in-time resolution picks the latest PUBLISHED version with <code className="text-[10px] bg-white px-1 rounded">effectiveAt ≤ now</code>.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {Object.entries(RULE_META).map(([type, meta]) => {
          const versions = byType[type] ?? [];
          const published = versions.find((v) => v.status === "PUBLISHED");
          const drafts = versions.filter((v) => v.status === "DRAFT");
          const Icon = meta.icon;
          let data: any = null;
          try { data = published ? JSON.parse(published.dataJson) : null; } catch {}
          return (
            <Card key={type} className="shadow-sm flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0"><Icon className="h-4 w-4 text-zinc-600" /></div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm">{meta.label}</CardTitle>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{meta.desc}</p>
                    </div>
                  </div>
                  {published ? (
                    <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 text-xs shrink-0">v{published.version} live</Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50 text-xs shrink-0">not set</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-2.5">
                {data && <RuleBody type={type} data={data} />}
                {drafts.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Draft versions</div>
                    {drafts.map((d) => (
                      <div key={d.id} className="flex items-center justify-between text-xs bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                        <span className="font-mono text-amber-900">v{d.version} · {fmtDate(d.createdAt)}</span>
                        <Button size="sm" className="h-6 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => publish(d.id)} disabled={busy === d.id}>
                          {busy === d.id ? "…" : <><CheckCircle2 className="h-3 w-3 mr-1" />Publish</>}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {versions.length === 0 && <p className="text-xs text-muted-foreground italic">No versions yet.</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// --- Structured rule renderers (no raw JSON) -------------------------------

function RuleBody({ type, data }: { type: string; data: any }) {
  switch (type) {
    case "service_area":
      return <ServiceAreaBody data={data} />;
    case "business_hours":
      return <BusinessHoursBody data={data} />;
    case "holidays":
      return <HolidaysBody data={data} />;
    case "after_hours":
      return <AfterHoursBody data={data} />;
    case "escalation_routing":
      return <EscalationBody data={data} />;
    case "missed_call_recovery":
      return <MissedCallBody data={data} />;
    default:
      return null;
  }
}

function ServiceAreaBody({ data }: { data: any }) {
  const zips: string[] = data.zips ?? [];
  const cities: { city: string; state: string }[] = data.cities ?? [];
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 text-xs">
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{zips.length} ZIPs</span>
        <span className="text-zinc-300">·</span>
        <span className="font-medium">{cities.length} cities</span>
        <span className="text-zinc-300">·</span>
        <Badge variant={data.allowRequestOnly ? "outline" : "secondary"} className={`text-[10px] ${data.allowRequestOnly ? "text-sky-700 border-sky-200 bg-sky-50" : ""}`}>{data.allowRequestOnly ? "request-only outside" : "strict"}</Badge>
      </div>
      <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto bg-zinc-50 rounded p-2 border border-zinc-100">
        {zips.slice(0, 80).map((z) => (
          <span key={z} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-zinc-200 text-zinc-700">{z}</span>
        ))}
        {zips.length > 80 && <span className="text-[10px] text-muted-foreground px-1.5 py-0.5">+{zips.length - 80} more</span>}
      </div>
      {cities.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {cities.map((c) => (
            <span key={`${c.city}-${c.state}`} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 border border-violet-200 text-violet-700">{c.city}, {c.state}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function BusinessHoursBody({ data }: { data: any }) {
  const hours: { dayOfWeek: number; open: string; close: string; closed: boolean }[] = data.hours ?? [];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <Hash className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Buffer</span>
        <span className="font-medium">{data.bufferMinutes ?? 0} min</span>
        <span className="text-zinc-300">·</span>
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-[11px]">{data.timezone}</span>
      </div>
      <div className="grid grid-cols-1 gap-0.5 text-xs">
        {WEEKDAYS.map((d, i) => {
          const h = hours.find((x) => x.dayOfWeek === i);
          return (
            <div key={d} className="flex items-center justify-between px-2 py-1 rounded hover:bg-zinc-50">
              <span className="text-muted-foreground w-8">{d}</span>
              {!h || h.closed ? (
                <span className="text-red-500 text-[11px]">closed</span>
              ) : (
                <span className="font-mono tabular-nums text-[11px]">{h.open} – {h.close}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HolidaysBody({ data }: { data: any }) {
  const holidays: { date: string; name: string }[] = data.holidays ?? [];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileText className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">{holidays.length}</span> holidays configured
      </div>
      {holidays.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No holidays configured.</p>
      ) : (
        <ul className="space-y-1">
          {holidays.map((h) => (
            <li key={h.date} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-red-50/50 border border-red-100">
              <span className="font-medium text-red-900">{h.name}</span>
              <span className="font-mono text-[11px] text-red-700">{h.date}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AfterHoursBody({ data }: { data: any }) {
  const behaviorMap: Record<string, { label: string; className: string }> = {
    voicemail: { label: "Voicemail", className: "bg-purple-100 text-purple-700 border-purple-200" },
    transfer: { label: "Transfer to on-call", className: "bg-amber-100 text-amber-700 border-amber-200" },
    ai_intake: { label: "AI intake → request", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  };
  const b = behaviorMap[data.closedBehavior] ?? behaviorMap.voicemail;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">When closed</span>
        <Badge variant="outline" className={`text-[11px] ${b.className}`}>{b.label}</Badge>
      </div>
      {data.transferPhone && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Transfer to</span>
          <span className="font-mono text-[11px]">{data.transferPhone}</span>
        </div>
      )}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Allow intake capture</span>
        <Badge variant={data.allowIntakeCapture ? "outline" : "secondary"} className={`text-[11px] ${data.allowIntakeCapture ? "text-emerald-700 border-emerald-200 bg-emerald-50" : ""}`}>{data.allowIntakeCapture ? "yes" : "no"}</Badge>
      </div>
    </div>
  );
}

function EscalationBody({ data }: { data: any }) {
  const emergency: string[] = data.emergencyKeywords ?? [];
  const urgent: string[] = data.urgentKeywords ?? [];
  return (
    <div className="space-y-2.5">
      <div>
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-700 mb-1.5"><ShieldAlert className="h-3.5 w-3.5" /> Emergency keywords → immediate transfer</div>
        <div className="flex flex-wrap gap-1">
          {emergency.map((k) => (
            <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-red-700 font-medium">{k}</span>
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 mb-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Urgent keywords</div>
        <div className="flex flex-wrap gap-1">
          {urgent.map((k) => (
            <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700">{k}</span>
          ))}
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground font-mono pt-1 border-t">
        emergency → {data.emergencyTransferPhone}
      </div>
    </div>
  );
}

function MissedCallBody({ data }: { data: any }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Recovery enabled</span>
        <Badge variant={data.enabled ? "outline" : "secondary"} className={`text-[11px] ${data.enabled ? "text-emerald-700 border-emerald-200 bg-emerald-50" : ""}`}>{data.enabled ? "yes" : "no"}</Badge>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Permitted hours</span>
        <span className="font-mono text-[11px]">{data.permittedHoursStart}:00 – {data.permittedHoursEnd}:00</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Cap</span>
        <span className="font-medium text-[11px]">1 per caller per {data.windowHours}h</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Auto-create lead</span>
        <Badge variant={data.createLead ? "outline" : "secondary"} className={`text-[11px] ${data.createLead ? "text-emerald-700 border-emerald-200 bg-emerald-50" : ""}`}>{data.createLead ? "yes" : "no"}</Badge>
      </div>
    </div>
  );
}
