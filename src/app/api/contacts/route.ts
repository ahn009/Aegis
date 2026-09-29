import { z } from "zod";
import { listContacts } from "@/lib/domain/contacts";
import { ok } from "@/lib/errors";
import { withApi, parseQuery } from "@/lib/http";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional(),
});

export const GET = withApi(async ({ user, req }) => {
  const q = await parseQuery(req, QuerySchema);
  const result = await listContacts(user.organizationId, { limit: q.limit, offset: q.offset, search: q.search });
  return Response.json(ok(result));
});
