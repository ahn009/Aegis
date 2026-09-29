# ADR 0005 — MockProvider as the default AI provider

Date: 2026-09-29 · Status: Accepted

## Context
The SPEC requires "a deterministic MockProvider so everything runs with zero API keys."
The orchestrator must exercise the real domain services (booking, area check, transfer,
SMS) identically whether the provider is Mock or OpenAI.

## Decision
- `MockProvider` (`src/lib/ai/provider-mock.ts`) is a deterministic, rule-based
  conversational agent. It inspects the conversation state + caller utterance, uses a
  regex/keyword intake parser, and emits assistant text + Zod-validated tool calls that
  the orchestrator executes against the **real** domain services.
- `OpenAIProvider` (`src/lib/ai/provider-openai.ts`) calls an OpenAI-compatible
  `/chat/completions` endpoint with function calling. It is selected only when
  `VELORA_AI_PROVIDER=openai` **and** `OPENAI_API_KEY` is set.
- The orchestrator (`src/lib/ai/orchestrator.ts`) is provider-agnostic. It runs the
  deterministic emergency pre-check **before** invoking the provider, validates every tool
  call, and applies the state machine via `assertTransition` (never prompt-only).
- Safe degradation: if the OpenAI provider throws, the orchestrator retries with Mock
  and speaks an apology + transfer path. Never false success.

## Consequences
- The whole system runs end-to-end with no external accounts (`bun run simulate-call`).
- All safety constraints (area check, double-booking, STOP suppression, emergency
  escalation) are exercised identically in both paths — the provider only decides *what
  to say* and *which tool to call*; the domain services decide *what is true*.
- Per-turn telemetry (provider, model, prompt version, tokens, latency, cost) is persisted
  for both providers.
