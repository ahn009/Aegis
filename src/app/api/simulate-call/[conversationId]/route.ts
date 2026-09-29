import { db } from "@/lib/db";
import { ApiError, ok } from "@/lib/errors";
import { withApi } from "@/lib/http";
import { requireSimulatorAccess } from "@/lib/simulator-access";

// GET /api/simulate-call/[conversationId] — fetch conversation state + messages
// for the interactive simulator UI.
export const GET = withApi(async ({ user, params }) => {
  requireSimulatorAccess();
  const id = String(params.conversationId);
  const conv = await db.conversation.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      call: true,
      messages: { orderBy: { createdAt: "asc" } },
      turns: { orderBy: { turnIndex: "asc" } },
    },
  });
  if (!conv) throw ApiError.notFound("Conversation not found");
  return Response.json(ok(conv));
});
