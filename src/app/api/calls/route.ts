import { z } from "zod";
import { listCalls } from "@/lib/domain/calls";
import { ok } from "@/lib/errors";
import { withApi, parseQuery } from "@/lib/http";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const GET = withApi(async ({ user, req }) => {
  const q = await parseQuery(req, QuerySchema);
  const result = await listCalls(user.organizationId, {
    limit: q.limit,
    offset: q.offset,
    status: q.status,
    from: q.from ? new Date(q.from) : undefined,
    to: q.to ? new Date(q.to) : undefined,
  });
  return Response.json(ok(result));
});
