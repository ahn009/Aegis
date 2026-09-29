"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtRelative } from "./format";
import { Cog, Loader2, Play, AlertOctagon, CheckCircle2 } from "lucide-react";

// Worker status indicator in the header. Polls /api/worker/status every 30s.
// ADMIN+ can trigger a run via the button (POST /api/worker/run).
export function WorkerStatus({ canTrigger }: { canTrigger: boolean }) {
  const [status, setStatus] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [justRan, setJustRan] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function poll() {
      const s = await api.workerStatus().catch(() => null);
      if (mounted && s) setStatus(s);
    }
    poll();
    const t = setInterval(poll, 30000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  async function run() {
    setRunning(true);
    try {
      await api.runWorker();
      const s = await api.workerStatus().catch(() => null);
      if (s) setStatus(s);
      setJustRan(true);
      setTimeout(() => setJustRan(false), 2500);
    } catch {}
    setRunning(false);
  }

  if (!status) {
    return <Badge variant="outline" className="gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /></Badge>;
  }
  const q = status.queue;
  const total = q.pending + q.processing;
  const dead = q.dead;
  const hasWork = total > 0;

  return (
    <div className="flex items-center gap-1.5">
      {justRan && <span className="text-[10px] text-emerald-600 animate-in fade-in">processed</span>}
      <Badge variant="outline" className={`gap-1.5 text-xs ${dead > 0 ? "border-red-200 bg-red-50 text-red-700" : hasWork ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`} title={`Queue: ${q.pending} pending · ${q.processing} processing · ${q.done} done · ${q.dead} dead. Last processed: ${status.lastProcessedAt ? fmtRelative(status.lastProcessedAt) : "never"}`}>
        {dead > 0 ? <AlertOctagon className="h-3 w-3" /> : hasWork ? <Cog className="h-3 w-3 animate-spin-slow" /> : <CheckCircle2 className="h-3 w-3" />}
        <span className="tabular-nums">{total}</span>
        {dead > 0 && <span className="text-red-600">·{dead} dead</span>}
      </Badge>
      {canTrigger && (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={run} disabled={running || !hasWork} title="Run outbox worker now">
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          Run
        </Button>
      )}
    </div>
  );
}
