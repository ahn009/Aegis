import { db } from "@/lib/db";
import { ApiError, ok } from "@/lib/errors";
import { withApi } from "@/lib/http";

export const GET = withApi(async ({ user, params }) => {
  const id = String(params.id);
  const call = await db.call.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      contact: true,
      conversation: { include: { messages: { orderBy: { createdAt: "asc" } }, turns: { orderBy: { turnIndex: "asc" } } } },
    },
  });
  if (!call) throw ApiError.notFound("Call not found");
  return Response.json(ok(call));
});
