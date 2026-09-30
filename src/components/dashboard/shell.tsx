"use client";

import { useEffect, useState } from "react";
import type { AuthUser, OrgInfo } from "@/app/page";
import { api } from "@/lib/api-client";
import { Overview } from "./overview";
import { Calls } from "./calls";
import { Contacts } from "./contacts";
import { Leads } from "./leads";
import { Appointments } from "./appointments";
import { Audit } from "./audit";
import { Analytics } from "./analytics";
import { SimulateCall } from "./simulate-call";
import { Rules } from "./rules";
import { WorkerStatus } from "./worker-status";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard, Phone, Users, UserPlus, CalendarClock, ScrollText, BarChart3,
  PhoneCall, BookOpen, LogOut, Menu, X,
} from "lucide-react";

type ViewId = "overview" | "calls" | "contacts" | "leads" | "appointments" | "audit" | "analytics" | "simulate" | "rules";

const NAV: { id: ViewId; label: string; icon: React.ComponentType<{ className?: string }>; group: string }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "Operations" },
  { id: "calls", label: "Calls", icon: Phone, group: "Operations" },
  { id: "contacts", label: "Contacts", icon: Users, group: "Operations" },
  { id: "leads", label: "Leads", icon: UserPlus, group: "Operations" },
  { id: "appointments", label: "Appointments", icon: CalendarClock, group: "Scheduling" },
  ...(process.env.NODE_ENV !== "production" ? [{ id: "simulate" as const, label: "Simulate Call", icon: PhoneCall, group: "AI Engine" }] : []),
  { id: "analytics", label: "Analytics", icon: BarChart3, group: "AI Engine" },
  { id: "rules", label: "Business Rules", icon: BookOpen, group: "AI Engine" },
  { id: "audit", label: "Audit Log", icon: ScrollText, group: "Compliance" },
];

export function Shell({ user, org, onLogout, onOrganizationChanged }: { user: AuthUser; org: OrgInfo | null; onLogout: () => void; onOrganizationChanged: () => Promise<void> }) {
  const [view, setView] = useState<ViewId>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [organizations, setOrganizations] = useState<{ id: string; name: string; timezone: string; role: string }[]>([]);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void api.organizations().then((data) => {
      if (active) setOrganizations(data.organizations);
    }).catch((error) => {
      if (active) setSwitchError((error as Error).message);
    });
    return () => { active = false; };
  }, []);

  async function changeOrganization(organizationId: string) {
    setSwitching(true);
    setSwitchError(null);
    try {
      await api.switchOrganization(organizationId);
      await onOrganizationChanged();
    } catch (error) {
      setSwitchError((error as Error).message);
    } finally {
      setSwitching(false);
    }
  }

  const initials = (user.name ?? user.email).slice(0, 2).toUpperCase();
  const canViewAudit = ["OWNER", "ADMIN", "MANAGER"].includes(user.role);
  const visibleNav = NAV.filter((item) => item.id !== "audit" || canViewAudit);
  const navGroups = Array.from(new Set(visibleNav.map((n) => n.group)));

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className={`${mobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 fixed lg:sticky top-0 left-0 z-40 h-screen w-64 shrink-0 border-r bg-white transition-transform`}>
          <div className="flex h-16 items-center justify-between px-5 border-b">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-emerald-500 flex items-center justify-center">
                <PhoneCall className="h-4 w-4 text-zinc-900" />
              </div>
              <div className="leading-tight">
                <div className="font-semibold text-sm">Velora</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">HVAC Ops</div>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={() => setMobileOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <nav className="px-3 py-4 space-y-5 overflow-y-auto h-[calc(100vh-4rem-5rem)]">
            {navGroups.map((group) => (
              <div key={group} className="space-y-1">
                <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1.5">{group}</div>
                {visibleNav.filter((n) => n.group === group).map((n) => {
                  const Icon = n.icon;
                  const active = view === n.id;
                  return (
                    <button
                      key={n.id}
                      onClick={() => { setView(n.id); setMobileOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                        active ? "bg-zinc-900 text-white font-medium" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {n.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 border-t bg-white p-3">
            <div className="flex items-center gap-2.5">
              <Avatar className="h-8 w-8"><AvatarFallback className="bg-zinc-900 text-white text-xs">{initials}</AvatarFallback></Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{user.name ?? user.email}</div>
                <div className="text-[10px] text-muted-foreground truncate">{user.role}</div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onLogout} title="Sign out">
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </aside>

        {mobileOpen && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />}

        {/* Main */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-20 h-16 border-b bg-white/80 backdrop-blur flex items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={() => setMobileOpen(true)}>
                <Menu className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-base font-semibold capitalize">{NAV.find((n) => n.id === view)?.label}</h1>
                <p className="text-xs text-muted-foreground">{org?.name ?? "—"} · {org?.timezone}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {organizations.length > 1 && (
                <label className="text-xs text-zinc-600">
                  <span className="sr-only">Active organization</span>
                  <select aria-label="Active organization" value={user.organizationId} disabled={switching} onChange={(event) => void changeOrganization(event.target.value)} className="max-w-36 rounded-md border bg-white px-2 py-1.5 text-xs sm:max-w-56">
                    {organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
              )}
              <WorkerStatus canTrigger={["OWNER", "ADMIN"].includes(user.role)} />
            </div>
          </header>

          {switchError && <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 sm:px-6">Organization switch failed: {switchError}</p>}

          <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-6">
            Preview workspace: calls, messages, and transfers are simulated. Dashboard totals can include preview activity.
          </div>

          <main className="flex-1 p-4 sm:p-6">
            {view === "overview" && <Overview />}
            {view === "calls" && <Calls />}
            {view === "contacts" && <Contacts />}
            {view === "leads" && <Leads />}
            {view === "appointments" && <Appointments />}
            {view === "audit" && <Audit />}
            {view === "analytics" && <Analytics />}
            {view === "simulate" && <SimulateCall />}
            {view === "rules" && <Rules />}
          </main>

        </div>
      </div>
    </div>
  );
}
