import { z } from "zod";
import { db } from "@/lib/db";
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
  const where: Record<string, unknown> = { organizationId: user.organizationId, deletedAt: null };
  if (q.status) where.status = q.status;
  if (q.from || q.to) {
    where.startTime = {};
    if (q.from) (where.startTime as any).gte = new Date(q.from);
    if (q.to) (where.startTime as any).lte = new Date(q.to);
  }
  const [items, total] = await Promise.all([
    db.appointment.findMany({
      where,
      orderBy: { startTime: "desc" },
      take: q.limit,
      skip: q.offset,
      include: { contact: true },
    }),
    db.appointment.count({ where }),
  ]);
  return Response.json(ok({ items, total }));
});
