"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import { Login } from "@/components/dashboard/login";
import { Shell } from "@/components/dashboard/shell";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  organizationId: string;
  role: string;
}
export interface OrgInfo { id: string; name: string; slug: string; timezone: string }

export default function Home() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  const refreshMe = useCallback(async () => {
    try {
      const data = await api.me();
      setUser(data.user);
      setOrg(data.organization ?? null);
    } catch (e) {
      setBootError((e as Error).message);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm">Loading Velora…</p>
          {bootError && <p className="text-xs text-destructive">{bootError}</p>}
        </div>
      </div>
    );
  }

  if (!user) return <Login onLoggedIn={refreshMe} />;
  return <Shell user={user} org={org} onLogout={async () => { try { await api.logout(); } catch {} setUser(null); }} />;
}
