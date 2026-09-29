import { db } from "@/lib/db";
import { publishVersion } from "@/lib/rules/engine";
import { ApiError, ok } from "@/lib/errors";
import { withApi } from "@/lib/http";

// POST /api/rules/[id]/publish — publish a DRAFT (MANAGER+).
export const POST = withApi(async ({ user, params }) => {
  const id = String(params.id);
  const draft = await db.businessRuleVersion.findFirst({
    where: { id, organizationId: user.organizationId, status: "DRAFT" },
  });
  if (!draft) throw ApiError.notFound("DRAFT rule version not found");
  await publishVersion(user.organizationId, draft.ruleType as any, draft.version, user.userId);
  return Response.json(ok({ published: true, version: draft.version }));
}, { role: "MANAGER" });
