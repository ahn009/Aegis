"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PhoneCall, ShieldCheck, Loader2 } from "lucide-react";

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("owner@velorahvac.example");
  const [password, setPassword] = useState("VeloraDemo2025!");
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
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 grid lg:grid-cols-2">
        <div className="hidden lg:flex flex-col justify-between p-12 bg-zinc-900 text-zinc-50 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "24px 24px" }} />
          <div className="relative">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-emerald-500 flex items-center justify-center">
                <PhoneCall className="h-5 w-5 text-zinc-900" />
              </div>
              <span className="text-xl font-semibold tracking-tight">Velora</span>
            </div>
          </div>
          <div className="relative space-y-5">
            <h1 className="text-4xl font-semibold tracking-tight leading-tight">
              The AI receptionist<br />that never books<br />out-of-area.
            </h1>
            <p className="text-zinc-400 text-lg max-w-md leading-relaxed">
              Multi-tenant HVAC response operations. AI interprets the call — deterministic software controls every booking, transfer, and message.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {["Double-booking protection", "Emergency escalation", "STOP suppression", "Audit trail"].map((f) => (
                <span key={f} className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">{f}</span>
              ))}
            </div>
          </div>
          <div className="relative text-xs text-zinc-500">© Velora Automations — HVAC Response Platform v1.0</div>
        </div>

        <div className="flex items-center justify-center p-6 sm:p-12">
          <Card className="w-full max-w-sm shadow-sm">
            <CardHeader className="space-y-2">
              <div className="lg:hidden flex items-center gap-2 mb-2">
                <div className="h-9 w-9 rounded-lg bg-emerald-500 flex items-center justify-center">
                  <PhoneCall className="h-4 w-4 text-zinc-900" />
                </div>
                <span className="font-semibold">Velora</span>
              </div>
              <CardTitle className="text-2xl">Sign in</CardTitle>
              <CardDescription>Access the operations dashboard.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
                </div>
                {error && (
                  <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">{error}</div>
                )}
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                  Sign in
                </Button>
                <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 leading-relaxed">
                  <span className="font-medium text-foreground">Demo credentials (pre-seeded):</span><br />
                  owner@velorahvac.example · VeloraDemo2025!<br />
                  <span className="opacity-70">dispatcher@velorahvac.example · VeloraDemo2025!</span>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
      <footer className="border-t bg-zinc-50 py-3 text-center text-xs text-muted-foreground">
        Velora HVAC Response System — SOC2-aligned operations platform
      </footer>
    </div>
  );
}
