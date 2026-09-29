import { z } from "zod";
import { runTurn } from "@/lib/ai/orchestrator";
import { env } from "@/lib/env";
import { ApiError, ok } from "@/lib/errors";
import { withApi, parseBody } from "@/lib/http";
import { db } from "@/lib/db";
import { createMockProvider as createMock } from "@/lib/ai/provider-mock";
import { createOpenAIProvider, isProviderConfigured } from "@/lib/ai/provider-openai";

const TurnSchema = z.object({
  conversationId: z.string(),
  callerUtterance: z.string().min(1).max(2000),
});

// POST /api/simulate-call/turn — run one orchestrator turn with the configured
// provider (MockProvider by default; OpenAI if VELORA_AI_PROVIDER=openai and
// OPENAI_API_KEY set). Falls back to Mock on OpenAI failure (safe degradation).
export const POST = withApi(async ({ user, req }) => {
  const { conversationId, callerUtterance } = await parseBody(req, TurnSchema);
  const conv = await db.conversation.findFirst({
    where: { id: conversationId, organizationId: user.organizationId },
    include: { call: true },
  });
  if (!conv) throw ApiError.notFound("Conversation not found");

  const provider = env.aiProvider === "openai" && isProviderConfigured() ? createOpenAIProvider() : createMock();

  let result;
  try {
    result = await runTurn(
      {
        organizationId: user.organizationId,
        conversationId: conv.id,
        callId: conv.callId,
        callerUtterance,
        fromPhone: conv.call.fromPhone,
        actorId: user.userId,
      },
      provider,
    );
  } catch (err) {
    // Safe degradation: if the OpenAI provider threw, retry with Mock.
    if (env.aiProvider === "openai") {
      console.error("[simulate-call/turn] OpenAI failed, falling back to Mock:", err);
      result = await runTurn(
        { organizationId: user.organizationId, conversationId: conv.id, callId: conv.callId, callerUtterance, fromPhone: conv.call.fromPhone, actorId: user.userId },
        createMock(),
      );
    } else {
      throw err;
    }
  }

  return Response.json(ok(result));
});
