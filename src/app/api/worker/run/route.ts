import { withApi } from "@/lib/http";
import { ok } from "@/lib/errors";
import { processOutbox } from "@/lib/worker/outbox";
import { requireRole } from "@/lib/auth-context";

// POST /api/worker/run — manually trigger outbox processing (ADMIN+).
// In production a background worker polls; this route lets the dashboard
// trigger a run and is also useful for tests.
export const POST = withApi(async ({ user }) => {
  requireRole(user, "ADMIN");
  const result = await processOutbox(100, user.organizationId);
  return Response.json(ok(result));
}, { role: "ADMIN" });
