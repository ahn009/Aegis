// ============================================================================
// Deterministic intake parser used by the MockProvider.
// Extracts structured fields from free-text caller utterances. This is NOT
// "AI understanding" — it's regex/keyword extraction that the mock provider
// uses to advance the state machine deterministically. The real OpenAI provider
// would extract these via function calling; the orchestrator treats both as
// untrusted input and re-validates via Zod + domain services.
// ============================================================================

import type { StructuredIntake } from "./types";
import { normalizePhone, isValidE164 } from "../phone";

const SERVICE_KEYWORDS: Record<string, string[]> = {
  AC_REPAIR: ["ac repair", "ac not", "air conditioner", "a/c repair", "ac unit", "ac broken", "ac blowing", "ac isn't", "ac is out"],
  HEATING_REPAIR: ["heating repair", "furnace", "heater", "heat not", "no heat", "heating", "furnace not"],
  MAINTENANCE: ["maintenance", "tune up", "tune-up", "check up", "checkup", "spring check", "fall check"],
  INSTALLATION: ["install", "installation", "new unit", "replace unit", "replacement", "new system", "new furnace", "new ac"],
  INSPECTION: ["inspection", "inspect", "safety inspection"],
};

const TIMING_KEYWORDS: Record<string, string[]> = {
  ASAP: ["as soon as possible", "asap", "right away", "today", "immediately"],
  TOMORROW: ["tomorrow", "next day"],
  THIS_WEEK: ["this week"],
  NEXT_WEEK: ["next week"],
  MORNING: ["morning"],
  AFTERNOON: ["afternoon"],
  EVENING: ["evening"],
};

const NAME_PATTERNS = [
  /\b(?:my name is|i'm|i am|this is|it's|its)\s+([a-z][a-z'\-]+(?:\s+[a-z][a-z'\-]+)?)/i,
  /\b(?:name's)\s+([a-z][a-z'\-]+(?:\s+[a-z][a-z'\-]+)?)/i,
];

const ZIP_PATTERN = /\b(\d{5}(?:-\d{4})?)\b/g;

export interface ParsedIntake {
  name?: string | null;
  callbackNumber?: string | null;
  zip?: string | null;
  city?: string | null;
  state?: string | null;
  serviceNeeded?: string | null;
  timing?: string | null;
  preferredSlotIso?: string | null;
}

export function parseIntake(utterance: string): ParsedIntake {
  const out: ParsedIntake = {};
  const lower = utterance.toLowerCase();

  // Name
  for (const re of NAME_PATTERNS) {
    const m = utterance.match(re);
    if (m?.[1]) {
      out.name = capitalize(m[1]);
      break;
    }
  }

  // Callback number — grab digit runs >= 10
  const digits = utterance.replace(/[^\d]/g, " ").split(/\s+/).filter((s) => s.length >= 10);
  if (digits.length) {
    const norm = normalizePhone(digits[0]!);
    if (norm && isValidE164(norm)) out.callbackNumber = norm;
  }
  // also try the whole utterance if it has a phone-like pattern
  if (!out.callbackNumber) {
    const phoneMatch = utterance.match(/(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
    if (phoneMatch) {
      const norm = normalizePhone(phoneMatch[1]!);
      if (norm && isValidE164(norm)) out.callbackNumber = norm;
    }
  }

  // ZIP
  const zips = utterance.match(ZIP_PATTERN);
  if (zips && zips.length) out.zip = zips[0];

  // City, State — "<city>, <ST>" or "in <city>"
  const cityState = utterance.match(/\b(?:in|at|from)\s+([A-Z][a-zA-Z .'-]+),\s*([A-Z]{2})\b/);
  if (cityState) {
    out.city = cityState[1]!.trim();
    out.state = cityState[2]!.trim();
  }

  // Service
  for (const [svc, kws] of Object.entries(SERVICE_KEYWORDS)) {
    if (kws.some((k) => lower.includes(k))) {
      out.serviceNeeded = svc;
      break;
    }
  }

  // Timing
  for (const [t, kws] of Object.entries(TIMING_KEYWORDS)) {
    if (kws.some((k) => lower.includes(k))) {
      out.timing = t;
      break;
    }
  }

  return out;
}

function capitalize(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function mergeIntake(current: StructuredIntake, parsed: ParsedIntake): StructuredIntake {
  return {
    name: parsed.name ?? current.name,
    callbackNumber: parsed.callbackNumber ?? current.callbackNumber,
    serviceAddressStreet: current.serviceAddressStreet,
    serviceAddressCity: parsed.city ?? current.serviceAddressCity,
    serviceAddressState: parsed.state ?? current.serviceAddressState,
    serviceAddressZip: parsed.zip ?? current.serviceAddressZip,
    serviceNeeded: parsed.serviceNeeded ?? current.serviceNeeded,
    timing: parsed.timing ?? current.timing,
    preferredSlot: current.preferredSlot,
  };
}

export function intakeCompleteness(intake: StructuredIntake): {
  missing: string[];
  complete: boolean;
} {
  const missing: string[] = [];
  if (!intake.name) missing.push("name");
  if (!intake.callbackNumber) missing.push("callback number");
  if (!intake.serviceAddressZip && !intake.serviceAddressCity) missing.push("service address (ZIP or city)");
  if (!intake.serviceNeeded) missing.push("service needed");
  if (!intake.timing && !intake.preferredSlot) missing.push("timing preference");
  return { missing, complete: missing.length === 0 };
}
