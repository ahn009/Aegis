import { z } from "zod";
import { updateLeadStatus, LEAD_STATUSES, type LeadStatus } from "@/lib/domain/leads";
import { ok } from "@/lib/errors";
import { withApi, parseBody } from "@/lib/http";
import { requireRole } from "@/lib/auth-context";

const StatusSchema = z.object({
  status: z.enum(LEAD_STATUSES),
});

// PATCH /api/leads/[id]/status — update a lead's status (DISPATCHER+).
// The AI never calls this; it's a staff workflow action. Org-scoped + audited.
export const PATCH = withApi(async ({ user, params, req }) => {
  requireRole(user, "DISPATCHER");
  const id = String(params.id);
  const { status } = await parseBody(req, StatusSchema);
  const res = await updateLeadStatus(user.organizationId, id, status as LeadStatus, user.userId);
  return Response.json(ok(res));
}, { role: "DISPATCHER" });

export const POST = withApi(async ({ user, params, req }) => {
  requireRole(user, "DISPATCHER");
  const id = String(params.id);
  const { status } = await parseBody(req, StatusSchema);
  const res = await updateLeadStatus(user.organizationId, id, status as LeadStatus, user.userId);
  return Response.json(ok(res));
}, { role: "DISPATCHER" });
