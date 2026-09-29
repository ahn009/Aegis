"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "./format";
import { BookOpen, CheckCircle2, FileText, Clock, MapPin, AlertTriangle, PhoneForwarded } from "lucide-react";

const RULE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; desc: string }> = {
  service_area: { label: "Service Area", icon: MapPin, desc: "ZIP/city lists — out-of-area never books" },
  business_hours: { label: "Business Hours", icon: Clock, desc: "Open/close per weekday + buffer (DST-aware)" },
  holidays: { label: "Holidays", icon: FileText, desc: "Closed dates that override business hours" },
  after_hours: { label: "After Hours", icon: Clock, desc: "Closed behavior: voicemail / transfer / ai_intake" },
  escalation_routing: { label: "Escalation Routing", icon: AlertTriangle, desc: "Emergency keywords → transfer; urgent keywords" },
  missed_call_recovery: { label: "Missed Call Recovery", icon: PhoneForwarded, desc: "Text-back cap: 1 per caller per 4h, permitted hours" },
};

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

  // Group by ruleType, show latest version per type
  const byType: Record<string, any[]> = {};
  for (const it of items) {
    (byType[it.ruleType] ??= []).push(it);
  }

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
          return (
            <Card key={type} className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-zinc-100 flex items-center justify-center"><Icon className="h-4 w-4 text-zinc-600" /></div>
                    <div>
                      <CardTitle className="text-sm">{meta.label}</CardTitle>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{meta.desc}</p>
                    </div>
                  </div>
                  {published && <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 text-xs">v{published.version} live</Badge>}
                  {!published && <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50 text-xs">not set</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {published && (
                  <div className="text-[11px] bg-muted/50 rounded p-2 font-mono break-all max-h-24 overflow-y-auto">
                    {prettyJson(published.dataJson)}
                  </div>
                )}
                {drafts.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Draft versions</div>
                    {drafts.map((d) => (
                      <div key={d.id} className="flex items-center justify-between text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                        <span className="font-mono">v{d.version} · {fmtDate(d.createdAt)}</span>
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

function prettyJson(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 0); } catch { return s; }
}
