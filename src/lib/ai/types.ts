import { z } from "zod";

// ============================================================================
// AI provider abstraction + tool registry types.
// SPEC: OpenAI-compatible chat completions behind an AiProvider interface,
// PLUS a deterministic MockProvider so everything runs with zero API keys.
// Tool calls: Zod-validated args, org context injected server-side, executed
// by domain services. Invalid args → ONE repair round → safe fallback.
// ============================================================================

export type ProviderRole = "system" | "user" | "assistant" | "tool";

export interface ProviderMessage {
  role: ProviderRole;
  content: string;
  toolCallId?: string;
  toolCalls?: ProviderToolCall[];
}

export interface ProviderToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface ProviderResponse {
  text: string | null;
  toolCalls?: ProviderToolCall[];
  // optional next-state hint (mock provider uses this; orchestrator validates
  // via assertTransition before applying). OpenAI provider leaves undefined and
  // the orchestrator infers from tool calls.
  nextState?: ConversationState;
  // telemetry
  provider: string;
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface AiProvider {
  name: string;
  model: string;
  promptVersion: string;
  complete(input: ProviderInput): Promise<ProviderResponse>;
}

export interface ProviderInput {
  systemPrompt: string;
  messages: ProviderMessage[];
  // tools available (descriptions for the provider; execution happens in orchestrator)
  tools: ToolDefinition[];
  // hint about current conversation state (helps the mock provider)
  state: ConversationState;
  // accumulated structured intake the mock provider can read/write
  intake: StructuredIntake;
  // raw caller speech this turn (for the mock provider's deterministic parsing)
  callerUtterance: string;
  // org-supported services (so the mock/AI never invents services)
  supportedServices: string[];
}

// --- Conversation state machine (SPEC §20) --------------------------------

export const CONVERSATION_STATES = [
  "GREETING",
  "INTAKE",
  "SERVICE_AREA_CHECK",
  "AVAILABILITY",
  "BOOKING",
  "REQUESTING",
  "ESCALATION",
  "VOICEMAIL",
  "END",
] as const;
export type ConversationState = (typeof CONVERSATION_STATES)[number];

// Legal transitions. ESCALATION reachable from EVERY state (SPEC §20).
export const LEGAL_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
  GREETING: ["INTAKE", "ESCALATION", "VOICEMAIL", "END"],
  INTAKE: ["SERVICE_AREA_CHECK", "AVAILABILITY", "ESCALATION", "VOICEMAIL", "END", "INTAKE"],
  SERVICE_AREA_CHECK: ["AVAILABILITY", "REQUESTING", "ESCALATION", "VOICEMAIL", "END", "INTAKE"],
  AVAILABILITY: ["BOOKING", "REQUESTING", "ESCALATION", "VOICEMAIL", "END", "AVAILABILITY", "INTAKE"],
  BOOKING: ["END", "ESCALATION", "VOICEMAIL", "BOOKING"],
  REQUESTING: ["END", "ESCALATION", "VOICEMAIL", "REQUESTING"],
  ESCALATION: ["VOICEMAIL", "END", "ESCALATION"],
  VOICEMAIL: ["END", "VOICEMAIL"],
  END: ["END"],
};

export function isLegalTransition(from: ConversationState, to: ConversationState): boolean {
  if (from === to) return true; // staying in same state (multi-turn intake)
  if (to === "ESCALATION") return true; // reachable from every state
  return LEGAL_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ConversationState, to: ConversationState): void {
  if (!isLegalTransition(from, to)) {
    throw new Error(`Illegal conversation transition: ${from} → ${to}`);
  }
}

// --- Structured intake (accumulated across turns) --------------------------

export const StructuredIntake = z.object({
  name: z.string().nullable().default(null),
  callbackNumber: z.string().nullable().default(null),
  serviceAddressStreet: z.string().nullable().default(null),
  serviceAddressCity: z.string().nullable().default(null),
  serviceAddressState: z.string().nullable().default(null),
  serviceAddressZip: z.string().nullable().default(null),
  serviceNeeded: z.string().nullable().default(null),
  timing: z.string().nullable().default(null),
  preferredSlot: z.string().nullable().default(null),
});
export type StructuredIntake = z.infer<typeof StructuredIntake>;

// --- Tool definitions (Zod-validated) --------------------------------------

export interface ToolDefinition {
  name: ToolName;
  description: string;
  args: z.ZodType<any, any>;
}

export const TOOL_NAMES = [
  "check_service_area",
  "get_availability",
  "book_appointment",
  "request_appointment",
  "create_or_update_contact",
  "create_lead",
  "transfer_to_human",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  // side effects produced (for audit + outbox)
  sideEffects?: SideEffect[];
}

export interface SideEffect {
  kind: "APPOINTMENT_BOOKED" | "APPOINTMENT_REQUESTED" | "CONTACT_UPSERT" | "LEAD_CREATE" | "TRANSFER" | "VOICEMAIL" | "SMS_QUEUED";
  ref?: { entityType: string; entityId: string };
}

export interface ToolContext {
  organizationId: string;
  // org-supported services — tool rejects anything outside this list
  supportedServices: string[];
  // session user if invoked from dashboard simulate; undefined in voice path
  actorId?: string;
}
