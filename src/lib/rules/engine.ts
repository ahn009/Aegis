import { db } from "../db";
import { validateRule, type AnyRule, type RuleType } from "./schemas";
import { auditInTransaction } from "../audit";

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

type RuleData<K extends RuleType> = Extract<AnyRule, { type: K }>;
type PublishedRules = { [K in RuleType]: PublishedRule<RuleData<K>> | null };

export async function getPublishedRule<K extends RuleType>(
  organizationId: string,
  ruleType: K,
  at: Date = new Date(),
): Promise<PublishedRule<RuleData<K>> | null> {
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
  const data = validateRule(ruleType, JSON.parse(row.dataJson)) as RuleData<K>;
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
  const [service_area, business_hours, holidays, after_hours, escalation_routing, missed_call_recovery] = await Promise.all([
    getPublishedRule(organizationId, "service_area", at),
    getPublishedRule(organizationId, "business_hours", at),
    getPublishedRule(organizationId, "holidays", at),
    getPublishedRule(organizationId, "after_hours", at),
    getPublishedRule(organizationId, "escalation_routing", at),
    getPublishedRule(organizationId, "missed_call_recovery", at),
  ]);
  return { service_area, business_hours, holidays, after_hours, escalation_routing, missed_call_recovery } satisfies PublishedRules;
}

export interface RuleContext {
  organizationId: string;
  rules: PublishedRules;
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
  return db.$transaction(async (tx) => {
    const last = await tx.businessRuleVersion.findFirst({
      where: { organizationId, ruleType },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (last?.version ?? 0) + 1;
    const row = await tx.businessRuleVersion.create({
      data: {
        organizationId,
        ruleType,
        version,
        status: "DRAFT",
        dataJson: JSON.stringify(validated),
        effectiveAt: new Date(),
      },
    });
    await auditInTransaction(tx, {
      organizationId,
      actorType: actorId ? "USER" : "SYSTEM",
      actorId,
      action: "RULE_DRAFT_CREATE",
      entityType: "BusinessRuleVersion",
      entityId: row.id,
      after: { ruleType, version, data: validated },
    });
    return { id: row.id, version };
  });
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
  await db.$transaction(async (tx) => {
    const row = await tx.businessRuleVersion.findFirst({
      where: { organizationId, ruleType, version, status: "DRAFT" },
    });
    if (!row) throw new Error("DRAFT version not found");
    const updated = await tx.businessRuleVersion.updateMany({
      where: { id: row.id, organizationId, status: "DRAFT" },
      data: { status: "PUBLISHED", publishedAt: new Date(), effectiveAt, updatedAt: new Date() },
    });
    if (updated.count !== 1) throw new Error("DRAFT version changed");
    await auditInTransaction(tx, {
      organizationId,
      actorType: actorId ? "USER" : "SYSTEM",
      actorId,
      action: "RULE_PUBLISH",
      entityType: "BusinessRuleVersion",
      entityId: row.id,
      after: { ruleType, version, effectiveAt },
    });
  });
}
