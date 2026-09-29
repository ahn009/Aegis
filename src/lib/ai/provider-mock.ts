import type {
  AiProvider,
  ProviderInput,
  ProviderResponse,
  ProviderToolCall,
  ConversationState,
} from "./types";
import { PROMPT_VERSION } from "./prompts";
import { parseIntake, mergeIntake, intakeCompleteness } from "./intake-parser";
import { randomUUID } from "node:crypto";

// ============================================================================
// MockProvider — deterministic, zero API keys.
// Drives the full conversation: GREETING → INTAKE → SERVICE_AREA_CHECK →
// AVAILABILITY → BOOKING (or REQUESTING) → END, with ESCALATION reachable
// from every state. Emits tool calls that the orchestrator executes against
// real domain services — so the safety constraints (area check, double-booking
// protection, STOP suppression) are exercised identically to the OpenAI path.
// ============================================================================

const MODEL = "velora-mock-1";

function tc(name: string, args: unknown): ProviderToolCall {
  return { id: randomUUID(), name, args };
}

export class MockProvider implements AiProvider {
  name = "mock";
  model = MODEL;
  promptVersion = PROMPT_VERSION;

  async complete(input: ProviderInput): Promise<ProviderResponse> {
    const start = Date.now();
    const res = this.respond(input);
    return {
      ...res,
      provider: this.name,
      model: this.model,
      promptVersion: this.promptVersion,
      inputTokens: approxTokens(input.systemPrompt) + approxTokens(input.messages.map((m) => m.content).join(" ")),
      outputTokens: approxTokens(res.text ?? ""),
      latencyMs: Date.now() - start,
    };
  }

  private respond(input: ProviderInput): Pick<ProviderResponse, "text" | "toolCalls" | "nextState"> {
    const { state, intake, callerUtterance, supportedServices } = input;

    switch (state) {
      case "GREETING": {
        // Parse the first utterance too — if the caller already gave their
        // name, acknowledge it rather than robotically asking again.
        const parsed = parseIntake(callerUtterance);
        if (parsed.name) {
          return {
            text: `Thanks for calling Velora HVAC, ${parsed.name}. I'm Velora, your virtual receptionist. Can I get your callback number and the ZIP code for the service address?`,
            nextState: "INTAKE",
          };
        }
        return {
          text: `Thanks for calling Velora HVAC. I'm Velora, your virtual receptionist. Can I get your name, please?`,
          nextState: "INTAKE",
        };
      }

      case "INTAKE": {
        const parsed = parseIntake(callerUtterance);
        const merged = mergeIntake(intake, parsed);
        const completeness = intakeCompleteness(merged);
        if (process.env.VELORA_DEBUG === "1") {
          console.error("[mock:INTAKE]", JSON.stringify({ parsed, merged, missing: completeness.missing, complete: completeness.complete }));
        }

        // Validate service is in org's supported list
        if (parsed.serviceNeeded && !supportedServices.includes(parsed.serviceNeeded)) {
          return {
            text: `I see you're asking about ${prettyService(parsed.serviceNeeded).toLowerCase()}. ` +
              `We handle ${supportedServices.map(prettyService).join(", ").toLowerCase()}. Let me transfer you to a team member who can help.`,
            toolCalls: [tc("transfer_to_human", { reason: "CALLER_REQUEST" })],
            nextState: "ESCALATION",
          };
        }

        if (completeness.complete) {
          return {
            text: `Thanks, ${merged.name}. So that's ${prettyService(merged.serviceNeeded!)} at ${merged.serviceAddressZip ?? merged.serviceAddressCity}. Let me check that we cover your area.`,
            toolCalls: [
              tc("check_service_area", {
                zip: merged.serviceAddressZip ?? undefined,
                city: merged.serviceAddressCity ?? undefined,
                state: merged.serviceAddressState ?? undefined,
              }),
              tc("create_or_update_contact", {
                name: merged.name,
                callbackNumber: merged.callbackNumber,
                addressZip: merged.serviceAddressZip ?? undefined,
                addressCity: merged.serviceAddressCity ?? undefined,
                addressState: merged.serviceAddressState ?? undefined,
              }),
            ],
            nextState: "SERVICE_AREA_CHECK",
          };
        }

        // Ask for the next missing field
        const ask = askForMissing(completeness.missing, merged);
        return { text: ask, nextState: "INTAKE" };
      }

      case "SERVICE_AREA_CHECK": {
        // Find the check_service_area tool result by name (not just the last).
        const areaResult = findToolResult(input.messages, "check_service_area") as { inArea?: boolean; matchedZip?: string } | null;
        if (areaResult && areaResult.inArea) {
          return {
            text: `Great news — we cover your area. Let me pull up our next available appointments.`,
            toolCalls: [tc("get_availability", { days: 3, slotMinutes: 60 })],
            nextState: "AVAILABILITY",
          };
        }
        if (areaResult && !areaResult.inArea) {
          return {
            text: `I'm sorry — it looks like ${input.intake.serviceAddressZip ?? "your area"} is just outside our service area. ` +
              `I can't book a visit there, but I can create an appointment request and have our team follow up. Would you like me to do that?`,
            toolCalls: [tc("create_lead", {
              phone: input.intake.callbackNumber ?? "",
              name: input.intake.name ?? undefined,
              serviceType: input.intake.serviceNeeded ?? undefined,
              serviceAddressZip: input.intake.serviceAddressZip ?? undefined,
              inServiceArea: false,
              source: "CALL",
              notes: "Out-of-area caller; appointment request offered.",
            })],
            nextState: "REQUESTING",
          };
        }
        return { text: "Let me check that for you.", nextState: "SERVICE_AREA_CHECK" };
      }

      case "AVAILABILITY": {
        const availResult = findToolResult(input.messages, "get_availability") as { slots?: Array<{ startIso: string; endIso: string }> } | null;
        const slots = availResult?.slots;
        if (slots && slots.length > 0) {
          const first = slots[0]!;
          const second = slots[1];
          const preferred = matchPreference(slots, intake.timing);
          const chosen = preferred ?? first;
          const altText = second ? ` I also have ${fmtSlot(second)}.` : "";
          return {
            text: `I have an opening ${fmtSlot(chosen)}.${altText} Would you like me to book that for you?`,
            nextState: "BOOKING",
          };
        }
        return {
          text: `I don't have any openings in the next few days. I can create an appointment request and our team will reach out — would that work?`,
          nextState: "REQUESTING",
        };
      }

      case "BOOKING": {
        // The orchestrator runs book_appointment when the caller confirms.
        const lower = callerUtterance.toLowerCase();
        if (/^(yes|yeah|yep|sure|book it|sounds good|that works|perfect|do it|let's do it|confirm)\b/i.test(lower) || lower.includes("book")) {
          const availResult = findToolResult(input.messages, "get_availability") as { slots?: Array<{ startIso: string; endIso: string }> } | null;
          const slots = availResult?.slots;
          const preferred = slots ? matchPreference(slots, intake.timing) : undefined;
          const chosen = preferred ?? slots?.[0];
          if (chosen) {
            return {
              text: `Locking that in for you now.`,
              toolCalls: [tc("book_appointment", {
                startIso: chosen.startIso,
                endIso: chosen.endIso,
                serviceType: input.intake.serviceNeeded ?? "MAINTENANCE",
                contactName: input.intake.name,
                callbackNumber: input.intake.callbackNumber ?? undefined,
                serviceAddressZip: input.intake.serviceAddressZip ?? undefined,
              })],
              nextState: "END",
            };
          }
        }
        if (/no|different|later|another|else/i.test(lower)) {
          return { text: `No problem — would you prefer a morning or afternoon slot later this week?`, nextState: "AVAILABILITY" };
        }
        return { text: `Would you like me to book that first slot? Just say "yes" to confirm.`, nextState: "BOOKING" };
      }

      case "REQUESTING": {
        const lower = callerUtterance.toLowerCase();
        if (/^(yes|yeah|sure|please|ok|okay)\b/i.test(lower)) {
          return {
            text: `I'll create that appointment request now and our team will follow up shortly.`,
            toolCalls: [tc("request_appointment", {
              serviceType: input.intake.serviceNeeded ?? "MAINTENANCE",
              contactName: input.intake.name,
              callbackNumber: input.intake.callbackNumber ?? undefined,
              serviceAddressZip: input.intake.serviceAddressZip ?? undefined,
              timing: input.intake.timing ?? undefined,
              notes: "Out-of-area or no availability; appointment request.",
            })],
            nextState: "END",
          };
        }
        if (/no|forget|nevermind/i.test(lower)) {
          return { text: `No problem. Is there anything else I can help you with?`, nextState: "END" };
        }
        return { text: `Would you like me to create an appointment request so our team can follow up?`, nextState: "REQUESTING" };
      }

      case "ESCALATION": {
        return {
          text: `I'm transferring you to a team member now. Please stay on the line.`,
          toolCalls: [tc("transfer_to_human", { reason: "EMERGENCY" })],
          nextState: "END",
        };
      }

      case "VOICEMAIL": {
        return { text: `I'll take a quick message — please leave your name, number, and a brief reason for your call after the beep.`, nextState: "END" };
      }

      case "END": {
        return { text: `Thanks for calling — have a great day.`, nextState: "END" };
      }

      default:
        return { text: `I'm sorry, could you repeat that?`, nextState: state };
    }
  }
}

// --- helpers ----------------------------------------------------------------

function approxTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function prettyService(s: string): string {
  return s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function askForMissing(missing: string[], intake: any): string {
  if (missing.includes("name")) return "Can I get your name, please?";
  if (missing.includes("callback number")) return "What's the best callback number for you?";
  if (missing.includes("service address (ZIP or city)")) return "What's the ZIP code or city for the service address?";
  if (missing.includes("service needed")) return "Which service do you need — AC repair, heating repair, maintenance, installation, or inspection?";
  if (missing.includes("timing preference")) return "When were you hoping to have someone out — today, tomorrow, this week?";
  return "Is there anything else you'd like to add?";
}

function fmtSlot(slot: { startIso: string; endIso: string }): string {
  const start = new Date(slot.startIso);
  const fmt = new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
    timeZone: "America/Chicago",
  });
  return fmt.format(start);
}

function matchPreference(slots: Array<{ startIso: string; endIso: string }>, timing: string | null) {
  if (!timing) return undefined;
  const t = timing.toUpperCase();
  if (t === "MORNING") return slots.find((s) => new Date(s.startIso).getUTCHours() < 17);
  if (t === "AFTERNOON" || t === "EVENING") return slots.find((s) => new Date(s.startIso).getUTCHours() >= 16);
  if (t === "ASAP" || t === "TODAY") return slots[0];
  return undefined;
}

function lastToolResultMessage(messages: { role: string; content: string; toolCallId?: string }[]) {
  // Tool results come back as role=tool messages with content = JSON {name, result, ok}
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "tool") {
      try {
        const parsed = JSON.parse(m.content);
        return { name: parsed.name as string, result: parsed.result, ok: parsed.ok as boolean };
      } catch {
        return null;
      }
    }
  }
  return null;
}

function findToolResult(messages: { role: string; content: string }[], name: string): unknown {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "tool") {
      try {
        const parsed = JSON.parse(m.content);
        if (parsed.name === name) {
          // Tool results are stored as { ok, data, error }. Unwrap to data.
          return parsed.result?.data ?? null;
        }
      } catch {}
    }
  }
  return null;
}

export function createMockProvider(): MockProvider {
  return new MockProvider();
}
