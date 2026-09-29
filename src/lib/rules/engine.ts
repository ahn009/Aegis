import { db } from "../db";
import { validateRule, type AnyRule, type RuleType, RULE_TYPES } from "./schemas";

// ============================================================================
// Versioned business-rule evaluation engine.
// SPEC: DRAFT → PUBLISH immutable versions; effective_at point-in-time
// resolution; PUBLISHED-only is the effective one. AI never evaluates rules.
// ============================================================================

export interface PublishedRule<T = AnyRule> {
  id: string;
  organizationId: string;
  ruleType: RuleType;
  version: number;
  data: T;
  effectiveAt: Date;
  publishedAt: Date | null;
}

export async function getPublishedRule<T extends AnyRule>(
  organizationId: string,
  ruleType: RuleType,
  at: Date = new Date(),
): Promise<PublishedRule<T> | null> {
  const row = await db.businessRuleVersion.findFirst({
    where: {
      organizationId,
      ruleType,
      status: "PUBLISHED",
      effectiveAt: { lte: at },
    },
    orderBy: { effectiveAt: "desc" },
  });
  if (!row) return null;
  const data = validateRule(ruleType, JSON.parse(row.dataJson)) as T;
  return {
    id: row.id,
    organizationId,
    ruleType,
    version: row.version,
    data,
    effectiveAt: row.effectiveAt,
    publishedAt: row.publishedAt,
  };
}

export async function getAllPublishedRules(organizationId: string, at: Date = new Date()) {
  const out: Record<RuleType, PublishedRule | null> = {
    service_area: null,
    business_hours: null,
    holidays: null,
    after_hours: null,
    escalation_routing: null,
    missed_call_recovery: null,
  };
  for (const t of RULE_TYPES) {
    out[t] = await getPublishedRule(organizationId, t, at);
  }
  return out;
}

export interface RuleContext {
  organizationId: string;
  rules: Record<RuleType, PublishedRule | null>;
}

export async function loadRuleContext(organizationId: string, at: Date = new Date()): Promise<RuleContext> {
  return { organizationId, rules: await getAllPublishedRules(organizationId, at) };
}

// --- Versioning helpers ----------------------------------------------------

export async function createDraftVersion(
  organizationId: string,
  ruleType: RuleType,
  data: unknown,
  actorId?: string,
): Promise<{ id: string; version: number }> {
  const validated = validateRule(ruleType, data);
  const last = await db.businessRuleVersion.findFirst({
    where: { organizationId, ruleType },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (last?.version ?? 0) + 1;
  const row = await db.businessRuleVersion.create({
    data: {
      organizationId,
      ruleType,
      version,
      status: "DRAFT",
      dataJson: JSON.stringify(validated),
      effectiveAt: new Date(),
    },
  });
  // audit
  await db.auditLog.create({
    data: {
      organizationId,
      actorType: actorId ? "USER" : "SYSTEM",
      actorId: actorId ?? null,
      action: "RULE_DRAFT_CREATE",
      entityType: "BusinessRuleVersion",
      entityId: row.id,
      afterJson: JSON.stringify({ ruleType, version, data: validated }),
    },
  });
  return { id: row.id, version };
}

export async function publishVersion(
  organizationId: string,
  ruleType: RuleType,
  version: number,
  actorId?: string,
  effectiveAt: Date = new Date(),
): Promise<void> {
  // SPEC: PUBLISH is immutable — the row stays PUBLISHED forever; a later
  // PUBLISH creates a NEW version, the old one stays PUBLISHED but is
  // superceded by effectiveAt ordering in getPublishedRule. (We do NOT mutate
  // published rows.) We do set the prior version to ARCHIVED only when a newer
  // one is explicitly published, but retrieval always uses the latest
  // effectiveAt <= now among PUBLISHED rows.
  const row = await db.businessRuleVersion.findFirst({
    where: { organizationId, ruleType, version, status: "DRAFT" },
  });
  if (!row) throw new Error("DRAFT version not found");
  await db.businessRuleVersion.update({
    where: { id: row.id },
    data: { status: "PUBLISHED", publishedAt: new Date(), effectiveAt, updatedAt: new Date() },
  });
  await db.auditLog.create({
    data: {
      organizationId,
      actorType: actorId ? "USER" : "SYSTEM",
      actorId: actorId ?? null,
      action: "RULE_PUBLISH",
      entityType: "BusinessRuleVersion",
      entityId: row.id,
      afterJson: JSON.stringify({ ruleType, version, effectiveAt }),
    },
  });
}
