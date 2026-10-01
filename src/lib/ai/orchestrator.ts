import { db } from "../db";
import type {
  AiProvider,
  ProviderInput,
  ProviderMessage,
  ProviderResponse,
  ConversationState,
  StructuredIntake,
} from "./types";
import { assertTransition } from "./types";
import { TOOL_DEFINITIONS } from "./tool-schemas";
import { executeTool, type ExecContext, type ToolExecutionAttempt } from "./tool-executor";
import { systemPrompt, PROMPT_VERSION } from "./prompts";
import { parseIntake, mergeIntake, intakeCompleteness } from "./intake-parser";
import { emergencyFromPublished } from "../rules/evaluators";
import { loadRuleContext } from "../rules/engine";
import { appendMessage, recordTurn, updateConversationState } from "../domain/calls";
import { upsertContactByPhone } from "../domain/contacts";
import { sendSms } from "../domain/messaging";
import { normalizePhone } from "../phone";
import { audit } from "../audit";
import { ApiError } from "../errors";

// ============================================================================
// Orchestrator loop. SPEC §5: orchestrator loop, state machine, tool registry,
// per-turn persistence (model, prompt_version, tokens, latency, tool calls),
// emergency path. Safe degradation on AI failure.
//
// CRITICAL INVARIANT: the orchestrator runs the deterministic emergency
// classification BEFORE invoking the provider. If emergency keywords are
// present, it forces the ESCALATION state and calls transfer_to_human — the
// provider never gets to "decide" urgency. (SPEC §22)
// ============================================================================

export interface OrchestratorInput {
  organizationId: string;
  conversationId: string;
  callId?: string;
  callerUtterance: string;
  fromPhone: string;
  // session user (when invoked from dashboard simulate); undefined in voice path
  actorId?: string;
}

export interface OrchestratorTurnResult {
  assistantText: string;
  state: ConversationState;
  toolAttempts: ToolExecutionAttempt[];
  sideEffects: { kind: string; ref?: { entityType: string; entityId: string } }[];
  emergency: boolean;
  provider: string;
  model: string;
  promptVersion: string;
  // telemetry echoed for the dashboard
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costMicroUsd: number;
}

const SUPPORTED_SERVICES_DEFAULT = ["AC_REPAIR", "HEATING_REPAIR", "MAINTENANCE", "INSTALLATION", "INSPECTION"];

export async function runTurn(input: OrchestratorInput, provider: AiProvider): Promise<OrchestratorTurnResult> {
  const conv = await db.conversation.findFirst({
    where: { id: input.conversationId, organizationId: input.organizationId, callId: input.callId },
    include: { messages: { orderBy: { createdAt: "asc" } }, turns: { orderBy: { turnIndex: "asc" } } },
  });
  if (!conv) throw ApiError.notFound("Conversation not found");
  const org = await db.organization.findUniqueOrThrow({ where: { id: input.organizationId } });
  const supportedServices = await getSupportedServices(input.organizationId);
  const rules = await loadRuleContext(input.organizationId);

  // Load conversation + history
  const currentState = conv.state as ConversationState;

  // Load / init structured intake from conversation summary (we store the
  // accumulated intake in the conversation.outcome? no — store in a dedicated
  // field. For simplicity, re-derive from caller messages each turn.)
  const intake = deriveIntakeFromHistory(conv.messages.filter((m) => m.role === "caller").map((m) => m.content));

  // 1. Persist the caller's utterance
  await appendMessage(input.conversationId, "caller", input.callerUtterance);

  // 2. DETERMINISTIC EMERGENCY PRE-CHECK (SPEC §22 — never prompt-only)
  const cumulativeSpeech = [...conv.messages.filter((m) => m.role === "caller").map((m) => m.content), input.callerUtterance].join(" ");
  const isEmergency = emergencyFromPublished(rules.rules.escalation_routing, cumulativeSpeech);

  let effectiveState = currentState;
  let forcedToolCalls: { name: string; args: unknown }[] | null = null;
  let emergencyText: string | null = null;

  if (isEmergency && currentState !== "ESCALATION" && currentState !== "END") {
    // Force ESCALATION + transfer_to_human(EMERGENCY) deterministically
    assertTransition(currentState, "ESCALATION");
    effectiveState = "ESCALATION";
    forcedToolCalls = [{ name: "transfer_to_human", args: { reason: "EMERGENCY" } }];
    emergencyText = "I detected a possible emergency situation. I'm transferring you to a team member right now — please stay on the line.";
    await updateConversationState(input.conversationId, "ESCALATION", input.organizationId);
    // Update call urgency
    await db.call.update({ where: { id: conv.callId }, data: { urgency: "EMERGENCY" } });
  }

  const execCtx: ExecContext = {
    organizationId: input.organizationId,
    supportedServices,
    rules,
    org: { transferPhone: org.transferPhone, voicemailPhone: org.voicemailPhone, name: org.name, timezone: org.timezone },
    callId: input.callId ?? conv.callId,
    conversationId: input.conversationId,
    actorId: input.actorId,
  };

  let providerResponse: ProviderResponse;
  let toolAttempts: ToolExecutionAttempt[] = [];
  const sideEffects: OrchestratorTurnResult["sideEffects"] = [];

  if (forcedToolCalls) {
    // Execute the forced emergency transfer directly
    for (const tc of forcedToolCalls) {
      const attempt = await executeTool(tc.name, tc.args, execCtx);
      toolAttempts.push(attempt);
      sideEffects.push(...attempt.sideEffects);
      // persist tool result message
      await appendMessage(input.conversationId, "tool", JSON.stringify({ name: tc.name, result: attempt.result, ok: attempt.executionOk && attempt.validationOk }));
    }
    providerResponse = {
      text: emergencyText,
      toolCalls: undefined,
      nextState: "END",
      provider: "system",
      model: "deterministic-emergency",
      promptVersion: PROMPT_VERSION,
      inputTokens: 0,
      outputTokens: approxTokens(emergencyText ?? ""),
      latencyMs: 0,
    };
  } else {
    // 3. Build provider input (system prompt + history + tools + state + intake)
    const providerMessages: ProviderMessage[] = conv.messages.map((m) => ({
      role: m.role === "caller" ? "user" : m.role as ProviderMessage["role"],
      content: m.content,
    }));
    // include the just-appended caller message
    providerMessages.push({ role: "user", content: input.callerUtterance });

    const providerInput: ProviderInput = {
      systemPrompt: systemPrompt(org.name, supportedServices),
      messages: providerMessages,
      tools: Object.values(TOOL_DEFINITIONS),
      state: effectiveState,
      intake,
      callerUtterance: input.callerUtterance,
      supportedServices,
    };

    // 4. Call provider (with safe degradation on failure)
    try {
      providerResponse = await provider.complete(providerInput);
    } catch (err) {
      // SAFE DEGRADATION: AI failure mid-call → spoken apology → transfer/voicemail
      console.error("[orchestrator] provider failure:", err);
      const apology = "I'm sorry, I'm having trouble right now. Let me connect you with a team member.";
      // Force transfer to human (CALLER_REQUEST) as fallback
      const fallbackAttempt = await executeTool("transfer_to_human", { reason: "CALLER_REQUEST" }, execCtx);
      toolAttempts.push(fallbackAttempt);
      sideEffects.push(...fallbackAttempt.sideEffects);
      await appendMessage(input.conversationId, "tool", JSON.stringify({ name: "transfer_to_human", result: fallbackAttempt.result, ok: fallbackAttempt.executionOk && fallbackAttempt.validationOk }));
      providerResponse = {
        text: apology,
        nextState: "ESCALATION",
        provider: provider.name,
        model: provider.model,
        promptVersion: PROMPT_VERSION,
        inputTokens: 0,
        outputTokens: approxTokens(apology),
        latencyMs: 0,
      };
    }

    // 5. Execute tool calls (Zod-validated; ONE repair round on validation failure)
    if (providerResponse.toolCalls && providerResponse.toolCalls.length > 0) {
      for (const tc of providerResponse.toolCalls) {
        const attempt = await executeTool(tc.name, tc.args, execCtx);
        toolAttempts.push(attempt);
        sideEffects.push(...attempt.sideEffects);
        await appendMessage(input.conversationId, "tool", JSON.stringify({ name: tc.name, result: attempt.result, ok: attempt.executionOk && attempt.validationOk }));

        // REPAIR ROUND: if validation failed, ask the provider to repair ONCE
        if (!attempt.validationOk && !attempt.repaired) {
          const repairResp = await attemptRepair(provider, providerInput, tc, attempt.validationErrors);
          if (repairResp?.toolCalls?.length) {
            for (const rtc of repairResp.toolCalls) {
              const repairAttempt = await executeTool(rtc.name, rtc.args, execCtx);
              repairAttempt.repaired = true;
              toolAttempts.push(repairAttempt);
              sideEffects.push(...repairAttempt.sideEffects);
              await appendMessage(input.conversationId, "tool", JSON.stringify({ name: rtc.name, result: repairAttempt.result, ok: repairAttempt.executionOk && repairAttempt.validationOk }));
              if (!repairAttempt.validationOk || !repairAttempt.executionOk) {
                // SAFE FALLBACK after failed repair
                providerResponse.text = (providerResponse.text ?? "") + " I wasn't able to complete that action — let me connect you with a team member.";
                const fb = await executeTool("transfer_to_human", { reason: "CALLER_REQUEST" }, execCtx);
                toolAttempts.push(fb);
                sideEffects.push(...fb.sideEffects);
                await appendMessage(input.conversationId, "tool", JSON.stringify({ name: "transfer_to_human", result: fb.result, ok: fb.executionOk && fb.validationOk }));
                providerResponse.nextState = "ESCALATION";
              }
            }
          } else {
            // No repair produced → safe fallback
            providerResponse.text = (providerResponse.text ?? "") + " Let me connect you with a team member instead.";
            const fb = await executeTool("transfer_to_human", { reason: "CALLER_REQUEST" }, execCtx);
            toolAttempts.push(fb);
            sideEffects.push(...fb.sideEffects);
            await appendMessage(input.conversationId, "tool", JSON.stringify({ name: "transfer_to_human", result: fb.result, ok: fb.executionOk && fb.validationOk }));
            providerResponse.nextState = "ESCALATION";
          }
        }
      }
    }
  }

  // 6. Apply state transition (validated)
  let nextState = effectiveState;
  if (providerResponse.nextState) {
    try {
      assertTransition(effectiveState, providerResponse.nextState);
      nextState = providerResponse.nextState;
    } catch (e) {
      console.warn("[orchestrator] illegal transition blocked:", (e as Error).message);
      // stay in current state
    }
  } else {
    // Infer from side effects if provider didn't hint
    nextState = inferState(effectiveState, sideEffects, toolAttempts);
  }
  await updateConversationState(input.conversationId, nextState, input.organizationId);

  // 7. Persist assistant message
  const assistantText = providerResponse.text ?? "…";
  await appendMessage(input.conversationId, "assistant", assistantText);

  // 8. Persist per-turn record (model, prompt_version, tokens, latency, tool calls)
  const costMicroUsd = approxCostMicroUsd(providerResponse);
  await recordTurn({
    conversationId: input.conversationId,
    turnIndex: conv.turns.length,
    provider: providerResponse.provider,
    model: providerResponse.model,
    promptVersion: providerResponse.promptVersion,
    inputTokens: providerResponse.inputTokens,
    outputTokens: providerResponse.outputTokens,
    latencyMs: providerResponse.latencyMs,
    toolCalls: toolAttempts.map((a) => ({ tool: a.tool, validationOk: a.validationOk, executionOk: a.executionOk, error: a.error, repaired: a.repaired })),
    costMicroUsd,
  });

  // 9. Post-turn side effects: booking confirmation SMS, etc.
  for (const se of sideEffects) {
    if (se.kind === "APPOINTMENT_BOOKED" && se.ref) {
      // Send booking confirmation SMS (STOP-suppressed at sender level)
      const appt = await db.appointment.findFirst({ where: { id: se.ref.entityId, organizationId: input.organizationId } });
      const contact = appt?.contactId ? await db.contact.findFirst({ where: { id: appt.contactId, organizationId: input.organizationId } }) : null;
      if (appt && contact) {
        const when = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: org.timezone }).format(appt.startTime);
        await sendSms(input.organizationId, contact.phoneE164, `Your ${appt.serviceType.replace(/_/g, " ").toLowerCase()} appointment is confirmed for ${when}. Reply STOP to opt out.`, "BOOKING_CONFIRMATION");
      }
    }
  }

  return {
    assistantText,
    state: nextState,
    toolAttempts,
    sideEffects,
    emergency: isEmergency,
    provider: providerResponse.provider,
    model: providerResponse.model,
    promptVersion: providerResponse.promptVersion,
    inputTokens: providerResponse.inputTokens,
    outputTokens: providerResponse.outputTokens,
    latencyMs: providerResponse.latencyMs,
    costMicroUsd,
  };
}

// --- helpers ----------------------------------------------------------------

function deriveIntakeFromHistory(callerMessages: string[]): StructuredIntake {
  let intake: StructuredIntake = {
    name: null, callbackNumber: null, serviceAddressStreet: null,
    serviceAddressCity: null, serviceAddressState: null, serviceAddressZip: null,
    serviceNeeded: null, timing: null, preferredSlot: null,
  };
  for (const m of callerMessages) {
    intake = mergeIntake(intake, parseIntake(m));
  }
  return intake;
}

function inferState(current: ConversationState, sideEffects: OrchestratorTurnResult["sideEffects"], attempts: ToolExecutionAttempt[]): ConversationState {
  const toolNames = attempts.map((a) => a.tool);
  if (toolNames.includes("transfer_to_human")) return "ESCALATION";
  if (sideEffects.some((s) => s.kind === "APPOINTMENT_BOOKED")) return "END";
  if (sideEffects.some((s) => s.kind === "APPOINTMENT_REQUESTED")) return "END";
  if (toolNames.includes("book_appointment")) return "BOOKING";
  if (toolNames.includes("request_appointment")) return "REQUESTING";
  if (toolNames.includes("get_availability")) return "AVAILABILITY";
  if (toolNames.includes("check_service_area")) return "SERVICE_AREA_CHECK";
  return current;
}

async function attemptRepair(provider: AiProvider, input: ProviderInput, failedCall: { name: string; args: unknown }, errors: unknown): Promise<ProviderResponse | null> {
  // Append a system nudge describing the validation failure and re-run
  const nudge: ProviderMessage = {
    role: "system",
    content: `Your previous tool call "${failedCall.name}" failed validation: ${JSON.stringify(errors)}. Please re-issue the call with valid arguments. Do not repeat invalid values.`,
  };
  try {
    return await provider.complete({ ...input, messages: [...input.messages, nudge] });
  } catch (e) {
    console.error("[orchestrator] repair attempt failed:", e);
    return null;
  }
}

function approxTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function approxCostMicroUsd(resp: ProviderResponse): number {
  // Rough cost model: $0.15/1M input, $0.60/1M output (gpt-4o-mini-ish).
  // Mock provider is free.
  if (resp.provider === "mock" || resp.provider === "system") return 0;
  const inCost = Math.ceil((resp.inputTokens / 1_000_000) * 150_000);
  const outCost = Math.ceil((resp.outputTokens / 1_000_000) * 600_000);
  return inCost + outCost;
}

async function getSupportedServices(organizationId: string): Promise<string[]> {
  // Stored as a knowledge doc tagged "services" or a config; fallback to default list.
  const doc = await db.knowledgeDocument.findFirst({
    where: { organizationId, tags: { contains: "services" }, status: "PUBLISHED" },
  });
  if (doc) {
    try {
      const parsed = JSON.parse(doc.content);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {}
  }
  return SUPPORTED_SERVICES_DEFAULT;
}
