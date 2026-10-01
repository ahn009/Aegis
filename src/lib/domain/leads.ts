import { db } from "../db";
import { auditAsAiTool, auditInTransaction } from "../audit";
import { normalizePhone } from "../phone";
import { ApiError } from "../errors";

// ============================================================================
// Lead service. SPEC: lead creation with deterministic service-area status.
// The AI may not set inServiceArea — that's derived from check_service_area.
// (The tool executor overrides any AI-supplied inServiceArea with the
// deterministic result.)
// ============================================================================

export const LEAD_STATUSES = ["NEW", "CONTACTED", "BOOKED", "LOST"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

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

/**
 * Update a lead's status. Only the status field is mutable from the UI (and
 * only by DISPATCHER+). The AI never calls this — lead status is a staff
 * workflow action. Validated against the LEAD_STATUSES enum; org-scoped.
 */
export async function updateLeadStatus(
  organizationId: string,
  leadId: string,
  status: LeadStatus,
  actorId?: string,
): Promise<{ id: string; status: LeadStatus }> {
  if (!LEAD_STATUSES.includes(status)) {
    throw new ApiError(422, `Invalid lead status. Allowed: ${LEAD_STATUSES.join(", ")}`, "VALIDATION");
  }
  return db.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({ where: { id: leadId, organizationId, deletedAt: null } });
    if (!lead) throw new ApiError(404, "Lead not found", "NOT_FOUND");
    if (lead.status === status) return { id: lead.id, status };
    const updated = await tx.lead.updateMany({ where: { id: leadId, organizationId, deletedAt: null, status: lead.status }, data: { status } });
    if (updated.count !== 1) throw ApiError.conflict("Lead changed; retry status update");
    await auditInTransaction(tx, {
      organizationId,
      actorType: "USER",
      actorId: actorId ?? undefined,
      action: "LEAD_STATUS_UPDATE",
      entityType: "Lead",
      entityId: leadId,
      before: { status: lead.status },
      after: { status },
    });
    return { id: leadId, status };
  });
}

export async function getLead(organizationId: string, leadId: string) {
  const lead = await db.lead.findFirst({
    where: { id: leadId, organizationId, deletedAt: null },
    include: { contact: true },
  });
  if (!lead) return null;
  return lead;
}
