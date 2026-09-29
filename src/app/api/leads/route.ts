import { z } from "zod";
import { listLeads } from "@/lib/domain/leads";
import { ok } from "@/lib/errors";
import { withApi, parseQuery } from "@/lib/http";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.string().optional(),
});

export const GET = withApi(async ({ user, req }) => {
  const q = await parseQuery(req, QuerySchema);
  const result = await listLeads(user.organizationId, { limit: q.limit, offset: q.offset, status: q.status });
  return Response.json(ok(result));
});
