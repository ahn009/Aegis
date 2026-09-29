// Shared formatting helpers for the dashboard.

export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(d);
}

export function fmtDateShort(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(d);
}

export function fmtPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const m = phone.match(/^\+(\d{1,3})(\d{3})(\d{3})(\d{4})$/);
  if (m) return `+${m[1]} (${m[2]}) ${m[3]}-${m[4]}`;
  return phone;
}

export function fmtService(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fmtUrgency(u: string): { label: string; className: string } {
  switch (u) {
    case "EMERGENCY": return { label: "Emergency", className: "bg-red-100 text-red-700 border-red-200" };
    case "URGENT": return { label: "Urgent", className: "bg-amber-100 text-amber-700 border-amber-200" };
    default: return { label: "Routine", className: "bg-zinc-100 text-zinc-600 border-zinc-200" };
  }
}

export function fmtStatus(s: string): { label: string; className: string } {
  const map: Record<string, string> = {
    CONFIRMED: "bg-emerald-100 text-emerald-700 border-emerald-200",
    REQUESTED: "bg-blue-100 text-blue-700 border-blue-200",
    CANCELLED: "bg-zinc-100 text-zinc-500 border-zinc-200 line-through",
    COMPLETED: "bg-zinc-100 text-zinc-600 border-zinc-200",
    NOSHOW: "bg-red-100 text-red-700 border-red-200",
    COMPLETED_APT: "bg-emerald-50 text-emerald-700 border-emerald-200",
    NEW: "bg-sky-100 text-sky-700 border-sky-200",
    CONTACTED: "bg-amber-100 text-amber-700 border-amber-200",
    BOOKED: "bg-emerald-100 text-emerald-700 border-emerald-200",
    LOST: "bg-zinc-100 text-zinc-500 border-zinc-200",
    IN_PROGRESS: "bg-blue-100 text-blue-700 border-blue-200",
    RINGING: "bg-sky-100 text-sky-700 border-sky-200",
    COMPLETED_CALL: "bg-zinc-100 text-zinc-600 border-zinc-200",
    MISSED: "bg-red-100 text-red-700 border-red-200",
    VOICEMAIL: "bg-purple-100 text-purple-700 border-purple-200",
    TRANSFERRED: "bg-amber-100 text-amber-700 border-amber-200",
    FAILED: "bg-red-100 text-red-700 border-red-200",
  };
  return { label: s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()), className: map[s] ?? "bg-zinc-100 text-zinc-600 border-zinc-200" };
}

export function fmtState(s: string): { label: string; className: string } {
  const map: Record<string, string> = {
    GREETING: "bg-sky-100 text-sky-700 border-sky-200",
    INTAKE: "bg-blue-100 text-blue-700 border-blue-200",
    SERVICE_AREA_CHECK: "bg-amber-100 text-amber-700 border-amber-200",
    AVAILABILITY: "bg-cyan-100 text-cyan-700 border-cyan-200",
    BOOKING: "bg-emerald-100 text-emerald-700 border-emerald-200",
    REQUESTING: "bg-violet-100 text-violet-700 border-violet-200",
    ESCALATION: "bg-red-100 text-red-700 border-red-200",
    VOICEMAIL: "bg-purple-100 text-purple-700 border-purple-200",
    END: "bg-zinc-100 text-zinc-600 border-zinc-200",
  };
  return { label: s.replace(/_/g, " "), className: map[s] ?? "bg-zinc-100 text-zinc-600 border-zinc-200" };
}

export function fmtCost(microUsd: number): string {
  const usd = microUsd / 1_000_000;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export async function tryFetch<T>(fn: () => Promise<T>, setError: (e: string | null) => void): Promise<T | null> {
  try { return await fn(); } catch (e) { setError((e as Error).message); return null; }
}
