import { db } from "../db";
import { ApiError } from "../errors";
import { auditAsWorker } from "../audit";
import { normalizePhone } from "../phone";
import type { Prisma } from "@prisma/client";
import { redactPii } from "../audit";

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

export async function startInboundCall(input: InboundCallInput, client: Prisma.TransactionClient = db) {
  const fromPhone = normalizePhone(input.fromPhone);
  if (!fromPhone) throw new ApiError(422, "Invalid from phone", "VALIDATION");
  // Dedup on CallSid (SPEC: webhooks dedup on (provider, CallSid + event))
  const existing = await client.call.findUnique({ where: { callSid: input.callSid }, include: { conversation: true } });
  if (existing) {
    if (existing.organizationId !== input.organizationId || !existing.conversation) {
      throw new ApiError(409, "Call cannot be resumed", "CONFLICT");
    }
    return { call: existing, conversation: existing.conversation, deduped: true };
  }
  // Link contact if exists
  const contact = await client.contact.findUnique({
    where: { organizationId_phoneE164: { organizationId: input.organizationId, phoneE164: fromPhone } },
  });
  const call = await client.call.create({
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
  const conversation = await client.conversation.create({
    data: {
      organizationId: input.organizationId,
      callId: call.id,
      state: "GREETING",
    },
  });
  if (client === db) {
    await auditAsWorker(input.organizationId, "voice-gateway", {
      action: "CALL_START", entityType: "Call", entityId: call.id,
      after: { callSid: input.callSid, fromPhone, contactId: contact?.id ?? null },
    });
  } else {
    await client.auditLog.create({ data: {
      organizationId: input.organizationId, actorType: "WORKER", actorId: "voice-gateway",
      action: "CALL_START", entityType: "Call", entityId: call.id,
      afterJson: JSON.stringify(redactPii({ callSid: input.callSid, fromPhone, contactId: contact?.id ?? null })),
    } });
  }
  return { call, conversation, deduped: false };
}

export async function endCall(organizationId: string, callId: string, status: string, outcome?: string, client: Prisma.TransactionClient = db) {
  await client.call.update({
    where: { id: callId, organizationId },
    data: { status, endedAt: new Date() },
  });
  if (outcome) {
    await client.conversation.updateMany({
      where: { callId, organizationId },
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
  const updated = await db.conversation.updateMany({ where: { id: conversationId, organizationId }, data: { state } });
  if (updated.count !== 1) throw ApiError.notFound("Conversation not found");
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
