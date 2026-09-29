import { db } from "@/lib/db";
import { ok } from "@/lib/errors";
import { withApi } from "@/lib/http";

// GET /api/worker/status — outbox queue depth + last processed + last error.
// Read-only; any authed user can view (ADMIN+ to trigger via /api/worker/run).
export const GET = withApi(async ({ user }) => {
  const orgId = user.organizationId;
  const [pending, processing, dead, done, lastProcessed, lastError, byEventType] = await Promise.all([
    db.outboxEvent.count({ where: { organizationId: orgId, status: "PENDING" } }),
    db.outboxEvent.count({ where: { organizationId: orgId, status: "PROCESSING" } }),
    db.outboxEvent.count({ where: { organizationId: orgId, status: "DEAD" } }),
    db.outboxEvent.count({ where: { organizationId: orgId, status: "DONE" } }),
    db.outboxEvent.findFirst({ where: { organizationId: orgId, status: "DONE" }, orderBy: { processedAt: "desc" }, select: { processedAt: true, eventType: true } }),
    db.outboxEvent.findFirst({ where: { organizationId: orgId, status: "DEAD" }, orderBy: { createdAt: "desc" }, select: { lastError: true, eventType: true, createdAt: true } }),
    db.outboxEvent.groupBy({ by: ["status"], where: { organizationId: orgId }, _count: true }),
  ]);
  return Response.json(ok({
    queue: { pending, processing, dead, done },
    lastProcessedAt: lastProcessed?.processedAt?.toISOString() ?? null,
    lastProcessedType: lastProcessed?.eventType ?? null,
    lastError: lastError ? { type: lastError.eventType, message: lastError.lastError, at: lastError.createdAt.toISOString() } : null,
    byStatus: Object.fromEntries(byEventType.map((s) => [s.status, s._count])),
  }));
});
