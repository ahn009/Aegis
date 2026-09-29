"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtDateShort } from "./format";
import { Search, RefreshCw, ScrollText, User, Bot, Cog, Server } from "lucide-react";

const ACTOR_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  USER: User, AI_TOOL: Bot, WORKER: Cog, SYSTEM: Server,
};

export function Audit() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [actorType, setActorType] = useState("");
  const [search, setSearch] = useState("");

  function fetchItems() {
    return api.audit({ limit: 200, ...(action ? { action } : {}), ...(actorType ? { actorType } : {}) }).catch(() => ({ items: [], total: 0 }));
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
  }, [action, actorType]);

  const filtered = items.filter((a) => !search || a.action.toLowerCase().includes(search.toLowerCase()) || (a.entityType ?? "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search action / entity…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
        <select value={actorType} onChange={(e) => setActorType(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="">All actors</option>
          <option value="USER">User</option>
          <option value="AI_TOOL">AI Tool</option>
          <option value="WORKER">Worker</option>
          <option value="SYSTEM">System</option>
        </select>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
        <Badge variant="outline" className="text-xs">{total} total</Badge>
      </div>

      <Card className="shadow-sm">
        <div className="p-3 bg-amber-50 border-b border-amber-100 text-xs text-amber-800 flex items-center gap-2">
          <ScrollText className="h-3.5 w-3.5" />
          Append-only audit log — no UPDATE/DELETE endpoints exist. Every mutation (USER, AI_TOOL, or WORKER) writes exactly one row.
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b text-xs text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Actor</th>
                <th className="text-left font-medium px-4 py-2.5">Action</th>
                <th className="text-left font-medium px-4 py-2.5">Entity</th>
                <th className="text-left font-medium px-4 py-2.5">After</th>
                <th className="text-left font-medium px-4 py-2.5">When</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const Icon = ACTOR_ICON[a.actorType] ?? Server;
                return (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-zinc-50">
                    <td className="px-4 py-2"><div className="flex items-center gap-1.5"><Icon className="h-3 w-3 text-muted-foreground" /><span className="text-xs font-mono">{a.actorType}</span></div><div className="text-[10px] text-muted-foreground mt-0.5">{a.actorId ?? "—"}</div></td>
                    <td className="px-4 py-2"><span className="font-mono text-xs font-medium">{a.action}</span></td>
                    <td className="px-4 py-2 text-xs"><div>{a.entityType}</div><div className="text-muted-foreground font-mono text-[10px]">{a.entityId?.slice(0, 12) ?? "—"}</div></td>
                    <td className="px-4 py-2 text-[11px] font-mono text-muted-foreground max-w-xs"><div className="truncate" title={a.afterJson ?? ""}>{a.afterJson ?? "—"}</div></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{fmtDateShort(a.createdAt)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-sm">{loading ? "Loading…" : "No audit entries."}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
