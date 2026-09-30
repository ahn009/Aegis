import { z } from "zod";
import { db } from "@/lib/db";
import { ok } from "@/lib/errors";
import { withApi, parseQuery } from "@/lib/http";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  action: z.string().optional(),
  actorType: z.string().optional(),
  entityType: z.string().optional(),
});

export const GET = withApi(async ({ user, req }) => {
  const q = await parseQuery(req, QuerySchema);
  const where: Record<string, unknown> = { organizationId: user.organizationId };
  if (q.action) where.action = q.action;
  if (q.actorType) where.actorType = q.actorType;
  if (q.entityType) where.entityType = q.entityType;
  const [items, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: q.limit, skip: q.offset }),
    db.auditLog.count({ where }),
  ]);
  return Response.json(ok({ items, total }));
}, { role: "MANAGER" });
