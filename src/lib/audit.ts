import { db } from "./db";
import type { Prisma } from "@prisma/client";

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

function auditRow(input: AuditInput) {
  return {
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
}

/** Write an audit row in the caller's transaction. Failure rolls back the action. */
export async function auditInTransaction(tx: Prisma.TransactionClient, input: AuditInput): Promise<void> {
  await tx.auditLog.create({ data: auditRow(input) });
}

/** Mandatory audit for actions without a business transaction. */
export async function auditRequired(input: AuditInput): Promise<void> {
  await db.auditLog.create({ data: auditRow(input) });
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
