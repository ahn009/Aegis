import { db } from "../db";
import { ApiError } from "../errors";
import { auditAsAiTool } from "../audit";
import { isValidE164, normalizePhone } from "../phone";

// ============================================================================
// Contact service. SPEC: contact dedup by E.164 phone. AI may update name,
// email, address — NEVER the contact's org/id/CRM links.
// ============================================================================

export interface UpsertContactInput {
  organizationId: string;
  phoneE164: string;
  name?: string | null;
  email?: string | null;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZip?: string | null;
  notes?: string | null;
  // AI is FORBIDDEN from setting these — they're gated by the tool schema.
  externalCrmId?: never;
}

export interface UpsertContactResult {
  id: string;
  phoneE164: string;
  name: string | null;
  created: boolean;
}

export async function upsertContactByPhone(input: UpsertContactInput): Promise<UpsertContactResult> {
  const phone = normalizePhone(input.phoneE164);
  if (!phone || !isValidE164(phone)) {
    throw new ApiError(422, "Invalid callback number", "VALIDATION");
  }
  const existing = await db.contact.findUnique({
    where: { organizationId_phoneE164: { organizationId: input.organizationId, phoneE164: phone } },
  });
  if (existing) {
    // Merge: only fill in fields that are currently null AND the AI provided.
    // AI never overwrites a non-null field with null, and never touches
    // organizationId/id/externalCrmId (not accepted in input).
    const data: Record<string, string | null> = {};
    if (input.name && !existing.name) data.name = input.name;
    if (input.email && !existing.email) data.email = input.email;
    if (input.addressStreet && !existing.addressStreet) data.addressStreet = input.addressStreet;
    if (input.addressCity && !existing.addressCity) data.addressCity = input.addressCity;
    if (input.addressState && !existing.addressState) data.addressState = input.addressState;
    if (input.addressZip && !existing.addressZip) data.addressZip = input.addressZip;
    if (Object.keys(data).length === 0) {
      return { id: existing.id, phoneE164: existing.phoneE164, name: existing.name, created: false };
    }
    const updated = await db.contact.update({ where: { id: existing.id }, data });
    await auditAsAiTool(input.organizationId, "create_or_update_contact", {
      action: "CONTACT_UPDATE",
      entityType: "Contact",
      entityId: existing.id,
      before: { name: existing.name, email: existing.email, addressZip: existing.addressZip },
      after: data,
    });
    return { id: updated.id, phoneE164: updated.phoneE164, name: updated.name, created: false };
  }
  const created = await db.contact.create({
    data: {
      organizationId: input.organizationId,
      phoneE164: phone,
      name: input.name ?? null,
      email: input.email ?? null,
      addressStreet: input.addressStreet ?? null,
      addressCity: input.addressCity ?? null,
      addressState: input.addressState ?? null,
      addressZip: input.addressZip ?? null,
      notes: input.notes ?? null,
    },
  });
  await auditAsAiTool(input.organizationId, "create_or_update_contact", {
    action: "CONTACT_CREATE",
    entityType: "Contact",
    entityId: created.id,
    after: { phoneE164: phone, name: input.name ?? null },
  });
  return { id: created.id, phoneE164: created.phoneE164, name: created.name, created: true };
}

export async function findContactByPhone(organizationId: string, phoneE164: string) {
  const phone = normalizePhone(phoneE164);
  if (!phone) return null;
  return db.contact.findUnique({
    where: { organizationId_phoneE164: { organizationId, phoneE164: phone } },
  });
}

export async function listContacts(organizationId: string, opts: { search?: string; limit?: number; offset?: number } = {}) {
  const where: Record<string, unknown> = { organizationId, deletedAt: null };
  if (opts.search) {
    where.OR = [
      { name: { contains: opts.search } },
      { phoneE164: { contains: opts.search } },
      { addressZip: { contains: opts.search } },
    ];
  }
  const [items, total] = await Promise.all([
    db.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: opts.limit ?? 50,
      skip: opts.offset ?? 0,
    }),
    db.contact.count({ where }),
  ]);
  return { items, total };
}
