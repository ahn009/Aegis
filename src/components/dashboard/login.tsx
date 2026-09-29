"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Loader2, PhoneCall } from "lucide-react";

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.login(email, password);
      onLoggedIn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8f6] text-zinc-900 lg:grid lg:grid-cols-[1fr_1fr]">
      <section className="relative hidden min-h-screen flex-col justify-between overflow-hidden bg-[#112b25] p-10 text-white lg:flex xl:p-16">
        <div className="absolute -right-28 -top-28 h-96 w-96 rounded-full border border-white/10" />
        <div className="absolute -right-48 -top-48 h-[36rem] w-[36rem] rounded-full border border-white/10" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400 text-[#112b25]"><PhoneCall className="h-5 w-5" /></span>
          <span className="text-lg font-semibold tracking-tight">Velora</span>
        </div>

        <div className="relative max-w-xl pb-16">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">HVAC response, in one place</p>
          <h2 className="text-5xl font-semibold leading-[1.08] tracking-tight xl:text-6xl">Every call deserves a clear next step.</h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-emerald-50/70">See your calls, follow up with leads, and keep appointments moving from one simple workspace.</p>
        </div>
        <p className="relative text-sm text-emerald-50/50">Velora Automations</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-12 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white"><PhoneCall className="h-5 w-5" /></span>
            <span className="text-lg font-semibold tracking-tight">Velora</span>
          </div>
          <p className="mb-2 text-sm font-medium text-emerald-700">Welcome back</p>
          <h1 className="text-3xl font-semibold tracking-tight">Sign in to your workspace</h1>
          <p className="mt-3 text-sm text-zinc-500">Manage your calls, leads, and schedule.</p>

          <form onSubmit={submit} className="mt-9 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@company.com" className="h-11 bg-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" placeholder="Enter your password" className="h-11 bg-white" />
            </div>
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <Button type="submit" className="h-11 w-full justify-center bg-[#176b4a] text-white hover:bg-[#10573b]" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sign in
              {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </form>
          {process.env.NODE_ENV !== "production" && (
            <button type="button" className="mt-6 text-sm font-medium text-emerald-700 hover:underline" onClick={() => { setEmail("owner@velorahvac.example"); setPassword("VeloraDemo2025!"); setError(null); }}>
              Fill demo credentials
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
