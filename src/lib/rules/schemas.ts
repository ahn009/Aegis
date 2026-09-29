import { z } from "zod";

// ============================================================================
// Velora business-rules package
// SPEC §6: rule types with Zod schemas; DRAFT → PUBLISH immutable versions;
// effective_at point-in-time resolution. The AI NEVER evaluates these — only
// the deterministic engine does. AI output is untrusted input.
// ============================================================================

export const RULE_TYPES = [
  "service_area",
  "business_hours",
  "holidays",
  "after_hours",
  "escalation_routing",
  "missed_call_recovery",
] as const;
export type RuleType = (typeof RULE_TYPES)[number];

// --- service_area ---------------------------------------------------------
export const ServiceAreaRule = z.object({
  type: z.literal("service_area"),
  // ZIP list OR city list. Match if caller ZIP/city ∈ list.
  zips: z.array(z.string().regex(/^\d{5}(-\d{4})?$/)).default([]),
  cities: z
    .array(z.object({ city: z.string(), state: z.string().length(2) }))
    .default([]),
  // If true, out-of-area callers are still allowed to request (no booking).
  allowRequestOnly: z.boolean().default(true),
});
export type ServiceAreaRule = z.infer<typeof ServiceAreaRule>;

// --- business_hours -------------------------------------------------------
export const BusinessHoursRule = z.object({
  type: z.literal("business_hours"),
  // 0=Sun … 6=Sat
  hours: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      open: z.string().regex(/^\d{2}:\d{2}$/), // "08:00" local
      close: z.string().regex(/^\d{2}:\d{2}$/), // "18:00" local
      closed: z.boolean().default(false),
    }),
  ),
  timezone: z.string().default("America/Chicago"),
  // Minutes of buffer around each appointment (no slot within buffer of another)
  bufferMinutes: z.number().int().min(0).default(30),
});
export type BusinessHoursRule = z.infer<typeof BusinessHoursRule>;

// --- holidays -------------------------------------------------------------
export const HolidaysRule = z.object({
  type: z.literal("holidays"),
  holidays: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // "2025-12-25"
      name: z.string(),
    }),
  ),
});
export type HolidaysRule = z.infer<typeof HolidaysRule>;

// --- after_hours ----------------------------------------------------------
export const AfterHoursRule = z.object({
  type: z.literal("after_hours"),
  // When closed: route to voicemail | transfer | ai_intake
  closedBehavior: z.enum(["voicemail", "transfer", "ai_intake"]).default("voicemail"),
  transferPhone: z.string().optional(),
  // Allow AI to capture intake info even when closed (becomes a request, not booking)
  allowIntakeCapture: z.boolean().default(true),
});
export type AfterHoursRule = z.infer<typeof AfterHoursRule>;

// --- escalation_routing ---------------------------------------------------
export const EscalationRoutingRule = z.object({
  type: z.literal("escalation_routing"),
  // Deterministic safety keywords → EMERGENCY. SPEC §22: never prompt-only.
  emergencyKeywords: z.array(z.string()).default([
    "gas smell",
    "carbon monoxide",
    "smell gas",
    "burning",
    "smoke",
    "sparking",
    "active water",
    "flooding",
    "electrical hazard",
  ]),
  // Urgent (non-emergency) keywords → URGENT
  urgentKeywords: z.array(z.string()).default([
    "no heat",
    "no ac",
    "no cooling",
    "no heating",
    "freezing",
    "burst pipe",
    "leak",
  ]),
  // EMERGENCY path
  emergencyTransferPhone: z.string(),
  emergencyVoicemailPhone: z.string().optional(),
  // If transfer unreachable → voicemail + staff notification + follow-up record
  staffNotifyEmail: z.string().email().optional(),
  // URGENT path
  urgentTransferPhone: z.string().optional(),
});
export type EscalationRoutingRule = z.infer<typeof EscalationRoutingRule>;

// --- missed_call_recovery -------------------------------------------------
export const MissedCallRecoveryRule = z.object({
  type: z.literal("missed_call_recovery"),
  enabled: z.boolean().default(true),
  // Text-back only in permitted hours
  permittedHoursStart: z.number().int().min(0).max(23).default(8),
  permittedHoursEnd: z.number().int().min(0).max(23).default(20),
  textBackTemplate: z.string().default(
    "Hi, this is Velora HVAC — we missed your call. How can we help? Reply STOP to opt out.",
  ),
  // 1 per caller per windowMs
  windowHours: z.number().int().min(1).default(4),
  createLead: z.boolean().default(true),
});
export type MissedCallRecoveryRule = z.infer<typeof MissedCallRecoveryRule>;

// --- dispatcher -----------------------------------------------------------
export const RULE_SCHEMAS = {
  service_area: ServiceAreaRule,
  business_hours: BusinessHoursRule,
  holidays: HolidaysRule,
  after_hours: AfterHoursRule,
  escalation_routing: EscalationRoutingRule,
  missed_call_recovery: MissedCallRecoveryRule,
} as const;

export type AnyRule =
  | ServiceAreaRule
  | BusinessHoursRule
  | HolidaysRule
  | AfterHoursRule
  | EscalationRoutingRule
  | MissedCallRecoveryRule;

export function validateRule(type: RuleType, data: unknown): AnyRule {
  const schema = RULE_SCHEMAS[type];
  if (!schema) throw new Error(`Unknown rule type: ${type}`);
  return schema.parse(data) as AnyRule;
}
