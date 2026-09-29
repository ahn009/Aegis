// Typed API client for the dashboard. All requests are same-origin (cookie auth).
async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, ...init });
  const json = await res.json().catch(() => ({ ok: false, error: { code: "INTERNAL", message: res.statusText } }));
  if (!res.ok || !json.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    const err = new Error(msg) as Error & { code?: string; status?: number; details?: unknown };
    err.code = json?.error?.code;
    err.status = res.status;
    err.details = json?.error?.details;
    throw err;
  }
  return json.data as T;
}

export const api = {
  me: () => req<{ user: { id: string; email: string; name: string | null; organizationId: string; role: string } | null; organization?: { id: string; name: string; slug: string; timezone: string } }>("/api/auth/me"),
  login: (email: string, password: string) => req<{ user: any; organization: any }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => req<{ loggedOut: boolean }>("/api/auth/logout", { method: "POST" }),

  overview: () => req<any>("/api/overview"),
  analytics: () => req<any>("/api/analytics"),
  calls: (params: Record<string, string | number> = {}) => req<{ items: any[]; total: number }>(`/api/calls?${new URLSearchParams(params as any)}`),
  call: (id: string) => req<any>(`/api/calls/${id}`),
  contacts: (params: Record<string, string | number> = {}) => req<{ items: any[]; total: number }>(`/api/contacts?${new URLSearchParams(params as any)}`),
  contact: (id: string) => req<{ contact: any; calls: any[]; leads: any[]; appointments: any[] }>(`/api/contacts/${id}`),
  leads: (params: Record<string, string | number> = {}) => req<{ items: any[]; total: number }>(`/api/leads?${new URLSearchParams(params as any)}`),
  lead: (id: string) => req<any>(`/api/leads/${id}`),
  updateLeadStatus: (id: string, status: string) => req<{ id: string; status: string }>(`/api/leads/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  appointments: (params: Record<string, string | number> = {}) => req<{ items: any[]; total: number }>(`/api/appointments?${new URLSearchParams(params as any)}`),
  apptDetail: (id: string) => req<any>(`/api/appointments/${id}/detail`),
  confirmAppt: (id: string) => req<{ confirmed: boolean }>(`/api/appointments/${id}/confirm`, { method: "POST" }),
  cancelAppt: (id: string, reason: string) => req<{ cancelled: boolean }>(`/api/appointments/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
  audit: (params: Record<string, string | number> = {}) => req<{ items: any[]; total: number }>(`/api/audit?${new URLSearchParams(params as any)}`),
  rules: () => req<{ items: any[]; ruleTypes: string[] }>("/api/rules"),
  publishRule: (id: string) => req<{ published: boolean; version: number }>(`/api/rules/${id}/publish`, { method: "POST" }),

  simulateStart: (fromPhone: string, scenario: "normal" | "emergency" | "out_of_area") =>
    req<{ call: any; conversation: any; scenario: string }>("/api/simulate-call/start", { method: "POST", body: JSON.stringify({ fromPhone, scenario }) }),
  simulateTurn: (conversationId: string, callerUtterance: string) =>
    req<any>("/api/simulate-call/turn", { method: "POST", body: JSON.stringify({ conversationId, callerUtterance }) }),
  simulateGet: (conversationId: string) => req<any>(`/api/simulate-call/${conversationId}`),

  runWorker: () => req<any>("/api/worker/run", { method: "POST" }),
  workerStatus: () => req<any>("/api/worker/status"),
};
