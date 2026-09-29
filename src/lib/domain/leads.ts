import { db } from "../db";
import { auditAsAiTool } from "../audit";
import { normalizePhone } from "../phone";

// ============================================================================
// Lead service. SPEC: lead creation with deterministic service-area status.
// The AI may not set inServiceArea — that's derived from check_service_area.
// (The tool executor overrides any AI-supplied inServiceArea with the
// deterministic result.)
// ============================================================================

export interface CreateLeadInput {
  organizationId: string;
  contactId?: string;
  phoneE164: string;
  name?: string | null;
  serviceType?: string | null;
  serviceAddressZip?: string | null;
  urgency?: "ROUTINE" | "URGENT" | "EMERGENCY";
  inServiceArea?: boolean;
  source?: "CALL" | "WEB" | "SMS" | "REFERRAL";
  notes?: string;
  actorId?: string;
}

export async function createLead(input: CreateLeadInput) {
  const phone = normalizePhone(input.phoneE164);
  if (!phone) throw new Error("Invalid phone for lead");
  // Link contact if not provided
  let contactId = input.contactId;
  if (!contactId) {
    const c = await db.contact.findUnique({
      where: { organizationId_phoneE164: { organizationId: input.organizationId, phoneE164: phone } },
    });
    contactId = c?.id;
  }
  const lead = await db.lead.create({
    data: {
      organizationId: input.organizationId,
      contactId: contactId ?? null,
      phoneE164: phone,
      name: input.name ?? null,
      serviceType: input.serviceType ?? null,
      serviceAddressZip: input.serviceAddressZip ?? null,
      urgency: input.urgency ?? "ROUTINE",
      inServiceArea: input.inServiceArea ?? null,
      source: input.source ?? "CALL",
      status: "NEW",
      notes: input.notes ?? null,
    },
  });
  await auditAsAiTool(input.organizationId, "create_lead", {
    action: "LEAD_CREATE",
    entityType: "Lead",
    entityId: lead.id,
    after: { phoneE164: phone, serviceType: input.serviceType, urgency: input.urgency, inServiceArea: input.inServiceArea },
  });
  return lead;
}

export async function listLeads(organizationId: string, opts: { status?: string; limit?: number; offset?: number } = {}) {
  const where: Record<string, unknown> = { organizationId, deletedAt: null };
  if (opts.status) where.status = opts.status;
  const [items, total] = await Promise.all([
    db.lead.findMany({ where, orderBy: { createdAt: "desc" }, take: opts.limit ?? 50, skip: opts.offset ?? 0 }),
    db.lead.count({ where }),
  ]);
  return { items, total };
}
