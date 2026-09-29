"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fmtState, fmtPhone, fmtCost } from "./format";
import { PhoneCall, Send, Phone, PhoneOff, AlertTriangle, Cpu, Wrench, Bot, User, Loader2, RotateCcw } from "lucide-react";

const SCENARIOS = [
  { id: "normal", label: "Normal booking", phone: "+12145557777", hint: "In-area caller books AC repair" },
  { id: "emergency", label: "Emergency", phone: "+12145556666", hint: "Gas smell → immediate transfer" },
  { id: "out_of_area", label: "Out-of-area", phone: "+13105554444", hint: "Beverly Hills → request, not booking" },
] as const;

const QUICK_UTTERANCES = [
  "Hi, my name is Riley, my callback number is 214-555-7777.",
  "The service address is in Dallas, ZIP 75201.",
  "I need AC repair, hopefully sometime today.",
  "yes",
  "I smell gas near my furnace",
  "I need AC repair in Beverly Hills 90210",
];

export function SimulateCall() {
  const [phase, setPhase] = useState<"idle" | "active">("idle");
  const [phone, setPhone] = useState("+12145557777");
  const [scenario, setScenario] = useState<"normal" | "emergency" | "out_of_area">("normal");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [state, setState] = useState<string>("GREETING");
  const [turns, setTurns] = useState<any[]>([]);
  const [lastTurn, setLastTurn] = useState<any | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emergency, setEmergency] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, lastTurn]);

  async function start() {
    setBusy(true); setError(null);
    try {
      const r = await api.simulateStart(phone, scenario);
      setConversationId(r.conversation.id);
      setState(r.conversation.state);
      setMessages([]);
      setTurns([]);
      setLastTurn(null);
      setEmergency(false);
      setPhase("active");
      // Auto-greet: send an empty-ish first turn so Velora says hello
      await send("Hi, I'd like to schedule a service visit.");
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  async function send(utterance?: string) {
    const text = (utterance ?? input).trim();
    if (!text || !conversationId) return;
    setBusy(true); setError(null);
    setInput("");
    setMessages((m) => [...m, { id: `c-${Date.now()}`, role: "caller", content: text }]);
    try {
      const r = await api.simulateTurn(conversationId, text);
      setState(r.state);
      setEmergency(r.emergency);
      setTurns((t) => [...t, r]);
      setLastTurn(r);
      if (r.assistantText) {
        setMessages((m) => [...m, { id: `a-${Date.now()}`, role: "assistant", content: r.assistantText }]);
      }
      // also append tool-result bubbles
      if (r.toolAttempts?.length) {
        setMessages((m) => [...m, { id: `t-${Date.now()}`, role: "tool", attempts: r.toolAttempts }]);
      }
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  function reset() {
    setPhase("idle"); setConversationId(null); setMessages([]); setTurns([]); setLastTurn(null); setState("GREETING"); setEmergency(false); setInput(""); setError(null);
  }

  if (phase === "idle") {
    return (
      <div className="max-w-5xl mx-auto space-y-5">
        <Card className="shadow-sm border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0"><PhoneCall className="h-6 w-6 text-zinc-900" /></div>
              <div>
                <h2 className="text-lg font-semibold">Simulate an inbound call</h2>
                <p className="text-sm text-muted-foreground mt-1">Drive a full conversation through the AI orchestrator using the deterministic MockProvider — no Twilio or OpenAI account required. Every booking, transfer, and SMS is executed against the real domain services with all safety constraints enforced.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-[1fr_360px] gap-5 items-start">
          {/* Left: scenarios + start */}
          <div className="space-y-5">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Choose a scenario</div>
              <div className="grid sm:grid-cols-3 gap-3">
                {SCENARIOS.map((s) => (
                  <button key={s.id} onClick={() => { setScenario(s.id); setPhone(s.phone); }} className={`text-left p-4 rounded-lg border-2 transition-all ${scenario === s.id ? "border-emerald-500 bg-emerald-50" : "border-zinc-200 bg-white hover:border-zinc-300"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {s.id === "emergency" ? <AlertTriangle className="h-4 w-4 text-red-500" /> : s.id === "out_of_area" ? <PhoneOff className="h-4 w-4 text-amber-500" /> : <Phone className="h-4 w-4 text-emerald-500" />}
                      <span className="font-medium text-sm">{s.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{s.hint}</p>
                    <p className="text-[10px] font-mono text-muted-foreground/70 mt-2">{s.phone}</p>
                  </button>
                ))}
              </div>
            </div>

            <Card className="shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Caller phone (E.164)</label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="font-mono" />
                </div>
                {error && <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">{error}</div>}
                <Button onClick={start} disabled={busy || !phone} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PhoneCall className="h-4 w-4 mr-2" />}
                  Start simulated call
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right: how it works */}
          <Card className="shadow-sm bg-zinc-50/50">
            <CardContent className="p-5 space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">How it works</div>
                <ol className="space-y-2.5 text-xs text-muted-foreground">
                  <li className="flex gap-2"><span className="h-4 w-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span><span><span className="text-foreground font-medium">Inbound call</span> arrives via the voice webhook → a Call + Conversation are created (CallSid deduped).</span></li>
                  <li className="flex gap-2"><span className="h-4 w-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span><span><span className="text-foreground font-medium">Orchestrator</span> runs the deterministic emergency pre-check BEFORE the provider. If safety keywords match → immediate transfer.</span></li>
                  <li className="flex gap-2"><span className="h-4 w-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span><span><span className="text-foreground font-medium">MockProvider</span> emits assistant text + Zod-validated tool calls. The <span className="text-foreground font-medium">executor</span> re-derives service area, never trusts AI.</span></li>
                  <li className="flex gap-2"><span className="h-4 w-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">4</span><span><span className="text-foreground font-medium">Domain services</span> book (transactional re-check) or request (120-min hold) or transfer (phone from rules, never AI).</span></li>
                  <li className="flex gap-2"><span className="h-4 w-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">5</span><span>Every turn is <span className="text-foreground font-medium">persisted</span> (model, prompt_version, tokens, latency, cost) + audited.</span></li>
                </ol>
              </div>
              <div className="border-t pt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Conversation state machine</div>
                <div className="flex flex-wrap gap-1 items-center">
                  {["GREETING", "INTAKE", "AREA", "AVAIL", "BOOK", "REQUEST", "ESCAL", "VM", "END"].map((s, i, arr) => (
                    <span key={s} className="flex items-center gap-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-zinc-200 text-zinc-600 font-medium">{s}</span>
                      {i < arr.length - 1 && <span className="text-zinc-300 text-[10px]">→</span>}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">ESCALATION reachable from every state. Illegal transitions blocked in code, never by prompt alone.</p>
              </div>
              <div className="border-t pt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Quick utterances available during the call</div>
                <div className="flex flex-wrap gap-1">
                  {QUICK_UTTERANCES.map((q) => (
                    <span key={q} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white border border-zinc-200 text-zinc-700 truncate max-w-[160px]">{q}</span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const stateBadge = fmtState(state);
  const ended = state === "END";

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      {/* Conversation panel */}
      <Card className="shadow-sm flex flex-col h-[calc(100vh-13rem)]">
        <CardHeader className="py-3 border-b flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="h-9 w-9 rounded-full bg-emerald-500 flex items-center justify-center"><PhoneCall className="h-4 w-4 text-zinc-900" /></div>
              {busy && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-white animate-pulse" />}
            </div>
            <div>
              <div className="text-sm font-medium font-mono">{fmtPhone(phone)}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${stateBadge.className}`}>{stateBadge.label}</span>
                {emergency && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white font-medium">EMERGENCY</span>}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={reset} className="h-8 text-xs"><RotateCcw className="h-3 w-3 mr-1" />End & reset</Button>
        </CardHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-50/50">
          {messages.map((m) => (
            <div key={m.id}>
              {m.role === "caller" && (
                <div className="flex justify-start"><div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-white border px-3.5 py-2 text-sm shadow-sm"><div className="flex items-center gap-1.5 mb-0.5 text-[10px] text-muted-foreground"><User className="h-3 w-3" />Caller</div>{m.content}</div></div>
              )}
              {m.role === "assistant" && (
                <div className="flex justify-end"><div className="max-w-[80%] rounded-2xl rounded-br-sm bg-zinc-900 text-white px-3.5 py-2 text-sm shadow-sm"><div className="flex items-center gap-1.5 mb-0.5 text-[10px] text-zinc-400"><Bot className="h-3 w-3" />Velora</div>{m.content}</div></div>
              )}
              {m.role === "tool" && (
                <div className="flex justify-center">
                  <div className="w-full max-w-[90%] rounded-lg bg-amber-50 border border-amber-200 p-2.5 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-amber-800"><Wrench className="h-3 w-3" />Tool calls</div>
                    {m.attempts.map((a: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-[11px] font-mono bg-white rounded px-2 py-1">
                        <span className={a.executionOk && a.validationOk ? "text-emerald-700" : "text-red-600"}>{a.tool}{a.repaired ? " ↻" : ""}</span>
                        <span className="text-muted-foreground">{a.validationOk ? (a.executionOk ? "✓" : "✗ " + (a.error?.slice(0, 40) ?? "")) : "invalid args"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="flex justify-end"><div className="rounded-2xl rounded-br-sm bg-zinc-900 text-white px-3.5 py-2.5 text-sm"><span className="inline-flex gap-1"><span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "0ms" }} /><span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "150ms" }} /><span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "300ms" }} /></span></div></div>
          )}
          {messages.length === 0 && !busy && <div className="text-center text-sm text-muted-foreground py-10">Conversation ready. Type your first message below.</div>}
        </div>

        <div className="border-t p-3 space-y-2">
          {error && <div className="text-xs text-destructive">{error}</div>}
          <div className="flex gap-1.5 flex-wrap">
            {QUICK_UTTERANCES.slice(0, scenario === "emergency" ? 5 : scenario === "out_of_area" ? 6 : 4).map((q) => (
              <button key={q} onClick={() => !busy && send(q)} disabled={busy || ended} className="text-[11px] px-2 py-1 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 disabled:opacity-40 truncate max-w-[200px]">{q}</button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (!busy && !ended) send(); }} className="flex gap-2">
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={ended ? "Conversation ended" : "Type caller utterance…"} disabled={busy || ended} />
            <Button type="submit" disabled={busy || ended || !input.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Send className="h-4 w-4" /></Button>
          </form>
        </div>
      </Card>

      {/* Side panel: AI telemetry + state machine */}
      <div className="space-y-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-xs flex items-center gap-1.5"><Cpu className="h-3.5 w-3.5 text-muted-foreground" />Last turn telemetry</CardTitle></CardHeader>
          <CardContent className="space-y-2.5">
            {lastTurn ? (
              <>
                <Row label="Provider" value={lastTurn.provider} />
                <Row label="Model" value={lastTurn.model} mono />
                <Row label="Prompt" value={lastTurn.promptVersion} mono />
                <Row label="State" value={lastTurn.state} />
                <Row label="Input tok" value={String(lastTurn.inputTokens)} mono />
                <Row label="Output tok" value={String(lastTurn.outputTokens)} mono />
                <Row label="Latency" value={`${lastTurn.latencyMs}ms`} mono />
                <Row label="Cost" value={fmtCost(lastTurn.costMicroUsd)} mono />
                <Row label="Tools" value={String(lastTurn.toolAttempts?.length ?? 0)} mono />
                <Row label="Emergency" value={lastTurn.emergency ? "YES" : "no"} />
              </>
            ) : <p className="text-xs text-muted-foreground">No turns yet.</p>}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-xs">Conversation state machine</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {["GREETING", "INTAKE", "SERVICE_AREA_CHECK", "AVAILABILITY", "BOOKING", "REQUESTING", "ESCALATION", "VOICEMAIL", "END"].map((s) => {
              const cur = s === state;
              const done = turnIndex(s) < turnIndex(state);
              return (
                <div key={s} className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${cur ? "bg-zinc-900 text-white font-medium" : done ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${cur ? "bg-emerald-400" : done ? "bg-emerald-500" : "bg-zinc-300"}`} />
                  {s.replace(/_/g, " ")}
                  {cur && <span className="ml-auto text-[9px] uppercase">current</span>}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-xs">Side effects</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {turns.flatMap((t, i) => (t.sideEffects ?? []).map((se: any, j: number) => (
                <div key={`${i}-${j}`} className="text-[11px] flex items-center gap-1.5 font-mono">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{se.kind}{se.ref ? ` → ${se.ref.entityType}` : ""}
                </div>
              )))}
              {turns.flatMap((t) => t.sideEffects ?? []).length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className={mono ? "font-mono" : ""}>{value}</span></div>;
}

function turnIndex(s: string): number {
  return ["GREETING", "INTAKE", "SERVICE_AREA_CHECK", "AVAILABILITY", "BOOKING", "REQUESTING", "ESCALATION", "VOICEMAIL", "END"].indexOf(s);
}
