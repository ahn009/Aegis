import { db } from "./db";
import type { SessionUser } from "./session";

export type AuditActorType = "USER" | "AI_TOOL" | "WORKER" | "SYSTEM";

export interface AuditInput {
  organizationId: string;
  actorType: AuditActorType;
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

/**
 * Append-only audit hook. SPEC: no UPDATE/DELETE endpoints exist for audit.
 * Every mutation (USER, AI_TOOL, or WORKER) writes exactly one row.
 * Failures are logged but never block the caller — audit must not break a
 * business action, but we DO retry once synchronously to avoid silent drops.
 */
export async function audit(input: AuditInput): Promise<void> {
  const row = {
    organizationId: input.organizationId,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    beforeJson: input.before !== undefined ? safeStringify(redactPii(input.before)) : null,
    afterJson: input.after !== undefined ? safeStringify(redactPii(input.after)) : null,
    reason: input.reason ?? null,
  };
  try {
    await db.auditLog.create({ data: row });
  } catch (e) {
    console.error("[audit] write failed (attempt 1):", e);
    try {
      await db.auditLog.create({ data: row });
    } catch (e2) {
      console.error("[audit] write failed (attempt 2, giving up):", e2);
    }
  }
}

/** Audit as the session user (convenience). */
export function auditAsUser(user: SessionUser, input: Omit<AuditInput, "organizationId" | "actorType" | "actorId">) {
  return audit({
    ...input,
    organizationId: user.organizationId,
    actorType: "USER",
    actorId: user.userId,
  });
}

/** Audit as an AI tool call (convenience). */
export function auditAsAiTool(organizationId: string, toolName: string, input: Omit<AuditInput, "organizationId" | "actorType" | "actorId">) {
  return audit({
    ...input,
    organizationId,
    actorType: "AI_TOOL",
    actorId: toolName,
  });
}

/** Audit as a background worker (convenience). */
export function auditAsWorker(organizationId: string, workerName: string, input: Omit<AuditInput, "organizationId" | "actorType" | "actorId">) {
  return audit({
    ...input,
    organizationId,
    actorType: "WORKER",
    actorId: workerName,
  });
}

// --- PII redaction ---------------------------------------------------------

const PII_KEY_PATTERN = /phone|email|address|token|password|secret|credential|encryptedcreds|voicemailtranscript/i;

export function redactPii(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactPii);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (PII_KEY_PATTERN.test(k)) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = redactPii(v);
    }
  }
  return out;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
