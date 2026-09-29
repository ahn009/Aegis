"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtDateShort, fmtPhone } from "./format";
import { Search, RefreshCw, Users } from "lucide-react";

export function Contacts() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    const r = await api.contacts({ limit: 100, search }).catch(() => ({ items: [], total: 0 }));
    setItems(r.items); setTotal(r.total); setLoading(false);
  }
  useEffect(() => { load(); }, [search]);

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
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-zinc-50">
                  <td className="px-4 py-2.5 font-medium">{c.name ?? <span className="text-muted-foreground italic">Unknown</span>}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{fmtPhone(c.phoneE164)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{[c.addressStreet, c.addressCity, c.addressState, c.addressZip].filter(Boolean).join(", ") || "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDateShort(c.createdAt)}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground text-sm">{loading ? "Loading…" : <span className="inline-flex items-center gap-2"><Users className="h-4 w-4" />No contacts yet.</span>}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
