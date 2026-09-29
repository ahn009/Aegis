import type { PublishedRule } from "../rules/engine";
import { evalServiceArea, evalOpenStatus } from "../rules/evaluators";
import type { ServiceAreaRule, BusinessHoursRule, HolidaysRule, AfterHoursRule, EscalationRoutingRule } from "../rules/schemas";

// ============================================================================
// Service-area + transfer resolvers. The AI may NEVER decide these — they're
// resolved deterministically from org rules with org context. The transfer
// target phone is NEVER accepted from the AI; it's looked up from rules.
// ============================================================================

export function resolveServiceArea(
  serviceArea: PublishedRule<ServiceAreaRule> | null,
  input: { zip?: string | null; city?: string | null; state?: string | null },
): { inArea: boolean; matchedZip?: string; matchedCity?: string; allowRequestOnly: boolean } {
  if (!serviceArea) {
    // No service-area rule → default deny (safer). Caller must request.
    return { inArea: false, allowRequestOnly: true };
  }
  return evalServiceArea(serviceArea.data, input);
}

export interface OpenStatusResult {
  open: boolean;
  reason: "business_hours" | "holiday" | "closed";
}

export function resolveOpenStatus(
  bh: PublishedRule<BusinessHoursRule> | null,
  holidays: PublishedRule<HolidaysRule> | null,
  at: Date = new Date(),
): OpenStatusResult {
  if (!bh) return { open: false, reason: "closed" };
  return evalOpenStatus(bh.data, holidays?.data ?? null, at);
}

export interface TransferTarget {
  phone: string;
  reason: "EMERGENCY" | "URGENT" | "CALLER_REQUEST" | "AFTER_HOURS";
  // when transfer is unreachable, fall back to voicemail + notify
  voicemailPhone?: string;
  staffNotifyEmail?: string;
}

export function resolveTransferTarget(
  escalation: PublishedRule<EscalationRoutingRule> | null,
  afterHours: PublishedRule<AfterHoursRule> | null,
  org: { transferPhone?: string | null; voicemailPhone?: string | null },
  reason: "EMERGENCY" | "URGENT" | "CALLER_REQUEST",
): TransferTarget {
  // EMERGENCY → escalation rule's emergencyTransferPhone (NEVER from AI)
  if (reason === "EMERGENCY" && escalation) {
    return {
      phone: escalation.data.emergencyTransferPhone,
      reason: "EMERGENCY",
      voicemailPhone: escalation.data.emergencyVoicemailPhone ?? org.voicemailPhone ?? undefined,
      staffNotifyEmail: escalation.data.staffNotifyEmail,
    };
  }
  if (reason === "URGENT" && escalation?.data.urgentTransferPhone) {
    return {
      phone: escalation.data.urgentTransferPhone,
      reason: "URGENT",
      voicemailPhone: org.voicemailPhone ?? undefined,
      staffNotifyEmail: escalation.data.staffNotifyEmail,
    };
  }
  // CALLER_REQUEST → org default transfer phone
  if (org.transferPhone) {
    return {
      phone: org.transferPhone,
      reason,
      voicemailPhone: org.voicemailPhone ?? undefined,
      staffNotifyEmail: escalation?.data.staffNotifyEmail,
    };
  }
  // No transfer target configured → voicemail fallback
  return {
    phone: org.voicemailPhone ?? "",
    reason,
    voicemailPhone: org.voicemailPhone ?? undefined,
    staffNotifyEmail: escalation?.data.staffNotifyEmail,
  };
}
