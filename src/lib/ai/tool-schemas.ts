import { z } from "zod";
import type { ToolDefinition, ToolName } from "./types";

// ============================================================================
// Tool argument schemas. Every tool call is Zod-validated; org context is
// injected server-side by the orchestrator (never from provider args).
// SPEC: invalid args → ONE repair round → safe fallback + escalation.
// ============================================================================

export const CheckServiceAreaArgs = z.object({
  zip: z.string().regex(/^\d{5}(-\d{4})?$/).optional(),
  city: z.string().optional(),
  state: z.string().length(2).optional(),
});

export const GetAvailabilityArgs = z.object({
  fromDate: z.string().optional(), // ISO date, default today
  days: z.number().int().min(1).max(14).default(3),
  slotMinutes: z.number().int().min(30).max(240).default(60),
});

export const BookAppointmentArgs = z.object({
  startIso: z.string().datetime(),
  endIso: z.string().datetime(),
  serviceType: z.string(),
  contactName: z.string().nullable().optional(),
  callbackNumber: z.string().optional(),
  serviceAddressZip: z.string().optional(),
  notes: z.string().optional(),
});

export const RequestAppointmentArgs = z.object({
  startIso: z.string().datetime().optional(),
  serviceType: z.string(),
  contactName: z.string().nullable().optional(),
  callbackNumber: z.string().optional(),
  serviceAddressZip: z.string().optional(),
  timing: z.string().optional(),
  notes: z.string().optional(),
});

export const CreateOrUpdateContactArgs = z.object({
  name: z.string().nullable().optional(),
  callbackNumber: z.string(),
  email: z.string().email().optional(),
  addressStreet: z.string().optional(),
  addressCity: z.string().optional(),
  addressState: z.string().optional(),
  addressZip: z.string().optional(),
});

export const CreateLeadArgs = z.object({
  name: z.string().nullable().optional(),
  phone: z.string(),
  serviceType: z.string().optional(),
  serviceAddressZip: z.string().optional(),
  urgency: z.enum(["ROUTINE", "URGENT", "EMERGENCY"]).default("ROUTINE"),
  inServiceArea: z.boolean().optional(),
  source: z.enum(["CALL", "WEB", "SMS", "REFERRAL"]).default("CALL"),
  notes: z.string().optional(),
});

export const TransferToHumanArgs = z.object({
  reason: z.enum(["EMERGENCY", "URGENT", "CALLER_REQUEST"]),
  // target phone is NEVER accepted from the AI — it's resolved from rules.
});

export const TOOL_DEFINITIONS: Record<ToolName, ToolDefinition> = {
  check_service_area: {
    name: "check_service_area",
    description:
      "Deterministically check whether a caller's ZIP or city is within the org's service area. " +
      "Returns inArea boolean. The AI may never decide service-area status itself.",
    args: CheckServiceAreaArgs,
  },
  get_availability: {
    name: "get_availability",
    description:
      "Compute available appointment slots from business hours, holidays, existing appointments, and buffers. " +
      "The AI may never invent availability or pricing.",
    args: GetAvailabilityArgs,
  },
  book_appointment: {
    name: "book_appointment",
    description:
      "Book a CONFIRMED appointment with double-booking protection (transactional overlap re-check + DB constraint). " +
      "Refuses out-of-area callers and unsupported service types.",
    args: BookAppointmentArgs,
  },
  request_appointment: {
    name: "request_appointment",
    description:
      "Create an appointment REQUEST with a slot hold (TTL 120 min). Used when caller is out-of-area or wants confirmation, " +
      "or outside business hours.",
    args: RequestAppointmentArgs,
  },
  create_or_update_contact: {
    name: "create_or_update_contact",
    description:
      "Create or update a contact, deduped by E.164 phone. AI may update name, email, address — " +
      "NEVER the contact's org/id/CRM links.",
    args: CreateOrUpdateContactArgs,
  },
  create_lead: {
    name: "create_lead",
    description:
      "Create a lead with source attribution and deterministic service-area status. " +
      "AI may not set inServiceArea — that's derived from check_service_area.",
    args: CreateLeadArgs,
  },
  transfer_to_human: {
    name: "transfer_to_human",
    description:
      "Transfer to a human. Target phone is resolved from org escalation rules — NEVER from AI args. " +
      "Use reason=EMERGENCY for safety-keyword escalations.",
    args: TransferToHumanArgs,
  },
};

export const TOOL_ARG_SCHEMAS = {
  check_service_area: CheckServiceAreaArgs,
  get_availability: GetAvailabilityArgs,
  book_appointment: BookAppointmentArgs,
  request_appointment: RequestAppointmentArgs,
  create_or_update_contact: CreateOrUpdateContactArgs,
  create_lead: CreateLeadArgs,
  transfer_to_human: TransferToHumanArgs,
} as const;
