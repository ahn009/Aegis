import { getLead } from "@/lib/domain/leads";
import { ApiError, ok } from "@/lib/errors";
import { withApi } from "@/lib/http";

// GET /api/leads/[id] — lead detail (org-scoped).
export const GET = withApi(async ({ user, params }) => {
  const id = String(params.id);
  const lead = await getLead(user.organizationId, id);
  if (!lead) throw ApiError.notFound("Lead not found");
  return Response.json(ok(lead));
});
