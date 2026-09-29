import { db } from "../db";
import { ApiError } from "../errors";
import { auditAsWorker } from "../audit";
import { normalizePhone } from "../phone";

// ============================================================================
// Call + conversation service. SPEC §4 (voice infra) + §20 (state machine).
// In this build the Twilio webhook layer is simulated via API routes; the
// deterministic state machine lives in src/lib/ai/types.ts and is enforced
// by the orchestrator via assertTransition.
// ============================================================================

export interface InboundCallInput {
  organizationId: string;
  callSid: string;
  fromPhone: string;
  toPhone: string;
}

export async function startInboundCall(input: InboundCallInput) {
  const fromPhone = normalizePhone(input.fromPhone);
  if (!fromPhone) throw new ApiError(422, "Invalid from phone", "VALIDATION");
  // Dedup on CallSid (SPEC: webhooks dedup on (provider, CallSid + event))
  const existing = await db.call.findUnique({ where: { callSid: input.callSid } });
  if (existing) return { call: existing, deduped: true };
  // Link contact if exists
  const contact = await db.contact.findUnique({
    where: { organizationId_phoneE164: { organizationId: input.organizationId, phoneE164: fromPhone } },
  });
  const call = await db.call.create({
    data: {
      organizationId: input.organizationId,
      contactId: contact?.id ?? null,
      callSid: input.callSid,
      direction: "inbound",
      fromPhone,
      toPhone: input.toPhone,
      status: "IN_PROGRESS",
      urgency: "ROUTINE",
    },
  });
  const conversation = await db.conversation.create({
    data: {
      organizationId: input.organizationId,
      callId: call.id,
      state: "GREETING",
    },
  });
  await auditAsWorker(input.organizationId, "voice-gateway", {
    action: "CALL_START",
    entityType: "Call",
    entityId: call.id,
    after: { callSid: input.callSid, fromPhone, contactId: contact?.id ?? null },
  });
  return { call, conversation, deduped: false };
}

export async function endCall(organizationId: string, callId: string, status: string, outcome?: string) {
  await db.call.update({
    where: { id: callId },
    data: { status, endedAt: new Date() },
  });
  if (outcome) {
    await db.conversation.updateMany({
      where: { callId },
      data: { outcome, state: "END" },
    });
  }
}

export async function appendMessage(conversationId: string, role: string, content: string) {
  return db.conversationMessage.create({ data: { conversationId, role, content } });
}

export async function recordTurn(input: {
  conversationId: string;
  turnIndex: number;
  provider: string;
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  toolCalls?: unknown;
  costMicroUsd?: number;
}) {
  return db.conversationTurn.create({
    data: {
      conversationId: input.conversationId,
      turnIndex: input.turnIndex,
      provider: input.provider,
      model: input.model,
      promptVersion: input.promptVersion,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      latencyMs: input.latencyMs,
      toolCalls: input.toolCalls ? JSON.stringify(input.toolCalls) : null,
      costMicroUsd: input.costMicroUsd ?? 0,
    },
  });
}

export async function updateConversationState(conversationId: string, state: string, organizationId: string) {
  await db.conversation.update({ where: { id: conversationId }, data: { state } });
}

export async function getConversationForOrg(organizationId: string, conversationId: string) {
  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    include: { call: true, messages: { orderBy: { createdAt: "asc" } }, turns: { orderBy: { turnIndex: "asc" } } },
  });
  if (!conv || conv.organizationId !== organizationId) return null;
  return conv;
}

export async function listCalls(organizationId: string, opts: { limit?: number; offset?: number; status?: string; from?: Date; to?: Date } = {}) {
  const where: Record<string, unknown> = { organizationId };
  if (opts.status) where.status = opts.status;
  if (opts.from || opts.to) {
    where.startedAt = {};
    if (opts.from) (where.startedAt as any).gte = opts.from;
    if (opts.to) (where.startedAt as any).lte = opts.to;
  }
  const [items, total] = await Promise.all([
    db.call.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: opts.limit ?? 50,
      skip: opts.offset ?? 0,
      include: { contact: true },
    }),
    db.call.count({ where }),
  ]);
  return { items, total };
}
