import { z } from "zod";
import { db } from "@/lib/db";
import { createDraftVersion } from "@/lib/rules/engine";
import { RULE_TYPES, type RuleType } from "@/lib/rules/schemas";
import { ok } from "@/lib/errors";
import { withApi, parseBody } from "@/lib/http";
import { requireRole } from "@/lib/auth-context";

const CreateSchema = z.object({
  ruleType: z.enum(RULE_TYPES as any),
  data: z.record(z.string(), z.unknown()),
});

// GET: list all rule versions (org-scoped), newest first.
export const GET = withApi(async ({ user }) => {
  const items = await db.businessRuleVersion.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ ruleType: "asc" }, { version: "desc" }],
  });
  return Response.json(ok({ items, ruleTypes: RULE_TYPES }));
});

// POST: create a DRAFT version (MANAGER+).
export const POST = withApi(async ({ user, req }) => {
  requireRole(user, "MANAGER");
  const { ruleType, data } = await parseBody(req, CreateSchema);
  const res = await createDraftVersion(user.organizationId, ruleType as RuleType, data, user.userId);
  return Response.json(ok(res));
}, { role: "MANAGER" });
