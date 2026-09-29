import type {
  ServiceAreaRule,
  BusinessHoursRule,
  HolidaysRule,
  AfterHoursRule,
  EscalationRoutingRule,
} from "./schemas";
import type { PublishedRule } from "./engine";

// ============================================================================
// Deterministic rule evaluators. These are the ONLY source of truth for
// service-area, hours, availability, and urgency. The AI calls tools that
// delegate here — it can never invent availability, pricing, area status, or
// urgency. SPEC: "AI interprets conversations; deterministic software controls
// business actions."
// ============================================================================

export type Urgency = "ROUTINE" | "URGENT" | "EMERGENCY";

export interface ServiceAreaResult {
  inArea: boolean;
  matchedZip?: string;
  matchedCity?: string;
  allowRequestOnly: boolean;
}

export function evalServiceArea(rule: ServiceAreaRule, input: { zip?: string | null; city?: string | null; state?: string | null }): ServiceAreaResult {
  if (input.zip) {
    const zip5 = input.zip.slice(0, 5);
    if (rule.zips.includes(zip5)) {
      return { inArea: true, matchedZip: zip5, allowRequestOnly: rule.allowRequestOnly };
    }
  }
  if (input.city && input.state) {
    const match = rule.cities.find(
      (c) => c.city.toLowerCase() === input.city!.toLowerCase() && c.state.toUpperCase() === input.state!.toUpperCase(),
    );
    if (match) {
      return { inArea: true, matchedCity: match.city, allowRequestOnly: rule.allowRequestOnly };
    }
  }
  return { inArea: false, allowRequestOnly: rule.allowRequestOnly };
}

// --- Business hours (DST-aware) -------------------------------------------
// Uses Intl with the org's IANA timezone. SPEC: computed in org timezone,
// DST-aware; test the DST transition day.

export interface OpenStatus {
  open: boolean;
  // reason: business_hours | holiday | closed
  reason: "business_hours" | "holiday" | "closed";
  // next change ISO (local tz)
  nextChangeIso?: string;
}

function toZonedParts(dateUtc: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    weekday: "short", hour: "2-digit", hour12: false, minute: "2-digit",
  });
  const parts = fmt.formatToParts(dateUtc);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  // weekday short → index
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hour = get("hour");
  if (hour === "24") hour = "00";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    weekday: get("weekday"),
    dayOfWeek: wdMap[get("weekday")] ?? 0,
    hour: parseInt(hour, 10),
    minute: parseInt(get("minute"), 10),
  };
}

function zonedDateStr(dateUtc: Date, tz: string): string {
  const p = toZonedParts(dateUtc, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

export function evalOpenStatus(
  bh: BusinessHoursRule,
  holidays: HolidaysRule | null,
  atUtc: Date = new Date(),
): OpenStatus {
  const parts = toZonedParts(atUtc, bh.timezone);
  const dateStr = zonedDateStr(atUtc, bh.timezone);
  // Holiday check (by zoned date)
  if (holidays?.holidays.some((h) => h.date === dateStr)) {
    return { open: false, reason: "holiday" };
  }
  const dayRule = bh.hours.find((h) => h.dayOfWeek === parts.dayOfWeek);
  if (!dayRule || dayRule.closed) return { open: false, reason: "closed" };
  const nowMin = parts.hour * 60 + parts.minute;
  const [oh, om] = dayRule.open.split(":").map(Number);
  const [ch, cm] = dayRule.close.split(":").map(Number);
  const openMin = oh! * 60 + om!;
  const closeMin = ch! * 60 + cm!;
  if (nowMin >= openMin && nowMin < closeMin) {
    return { open: true, reason: "business_hours" };
  }
  return { open: false, reason: "closed" };
}

// --- Availability ----------------------------------------------------------
// slots = business hours − holidays − active appointments − buffers,
// computed in org timezone, DST-aware.

export interface AvailabilitySlot {
  startIso: string;
  endIso: string;
}

/**
 * Generate availability slots for a date range in the org's timezone.
 * `busy` = list of [startUtc, endUtc) intervals for existing CONFIRMED/REQUESTED
 * appointments (hold-until still active).
 */
export function computeAvailability(
  bh: BusinessHoursRule,
  holidays: HolidaysRule | null,
  busy: Array<{ start: Date; end: Date }>,
  opts: { fromDate: Date; days: number; slotMinutes?: number },
): AvailabilitySlot[] {
  const slotLen = opts.slotMinutes ?? 60;
  const bufferMs = bh.bufferMinutes * 60 * 1000;
  const slots: AvailabilitySlot[] = [];

  for (let d = 0; d < opts.days; d++) {
    const dayUtc = new Date(opts.fromDate.getTime() + d * 24 * 60 * 60 * 1000);
    const parts = toZonedParts(dayUtc, bh.timezone);
    const dateStr = zonedDateStr(dayUtc, bh.timezone);
    if (holidays?.holidays.some((h) => h.date === dateStr)) continue;
    const dayRule = bh.hours.find((h) => h.dayOfWeek === parts.dayOfWeek);
    if (!dayRule || dayRule.closed) continue;
    const [oh, om] = dayRule.open.split(":").map(Number);
    const [ch, cm] = dayRule.close.split(":").map(Number);

    // Build a zoned Date for open and close, then convert to UTC.
    // We construct via Intl (avoiding local-TZ bias) by computing the offset.
    const openZoned = `${dateStr}T${pad(oh!)}:${pad(om!)}:00`;
    const closeZoned = `${dateStr}T${pad(ch!)}:${pad(cm!)}:00`;
    const openUtc = zonedToUtc(openZoned, bh.timezone);
    const closeUtc = zonedToUtc(closeZoned, bh.timezone);
    if (!openUtc || !closeUtc) continue;

    for (let t = openUtc.getTime(); t + slotLen * 60 * 1000 <= closeUtc.getTime(); t += slotLen * 60 * 1000) {
      const start = new Date(t);
      const end = new Date(t + slotLen * 60 * 1000);
      // Check buffer + overlap against busy
      const conflict = busy.some((b) => {
        const bStartWithBuffer = new Date(b.start.getTime() - bufferMs);
        const bEndWithBuffer = new Date(b.end.getTime() + bufferMs);
        return start < bEndWithBuffer && end > bStartWithBuffer;
      });
      if (!conflict && end > new Date()) {
        slots.push({ startIso: start.toISOString(), endIso: end.toISOString() });
      }
    }
  }
  return slots;
}

function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

/** Convert a "local" ISO string in `tz` to a UTC Date. */
function zonedToUtc(zonedIsoNoTz: string, tz: string): Date | null {
  // Use the format trick: format a Date in the target tz and compare offsets.
  const asIfUtc = new Date(zonedIsoNoTz + "Z"); // pretend it's UTC
  // Compute the tz offset at that instant
  const offsetMin = tzOffsetMinutes(asIfUtc, tz);
  return new Date(asIfUtc.getTime() - offsetMin * 60 * 1000);
}

function tzOffsetMinutes(dateUtc: Date, tz: string): number {
  // Returns the offset of `tz` at the instant `dateUtc`, in minutes (east of UTC positive).
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(dateUtc);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  let hour = g("hour");
  if (hour === "24") hour = "00";
  const asUtc = Date.UTC(
    Number(g("year")), Number(g("month")) - 1, Number(g("day")),
    Number(hour), Number(g("minute")), Number(g("second")),
  );
  return Math.round((asUtc - dateUtc.getTime()) / 60000);
}

// --- Urgency (deterministic, NON-DIAGNOSTIC) ------------------------------
// SPEC: classify service type (only from org's supported list) and
// NON-DIAGNOSTIC urgency. Emergency keywords → EMERGENCY → transfer.

export interface UrgencyResult {
  urgency: Urgency;
  matchedKeyword?: string;
}

export function classifyUrgency(
  escalation: EscalationRoutingRule | null,
  callerSpeech: string,
): UrgencyResult {
  if (!escalation) return { urgency: "ROUTINE" };
  const lower = callerSpeech.toLowerCase();
  // EMERGENCY first (highest precedence)
  for (const kw of escalation.emergencyKeywords) {
    if (lower.includes(kw.toLowerCase())) {
      return { urgency: "EMERGENCY", matchedKeyword: kw };
    }
  }
  for (const kw of escalation.urgentKeywords) {
    if (lower.includes(kw.toLowerCase())) {
      return { urgency: "URGENT", matchedKeyword: kw };
    }
  }
  return { urgency: "ROUTINE" };
}

export function isEmergency(callerSpeech: string, escalation: EscalationRoutingRule | null): boolean {
  return classifyUrgency(escalation, callerSpeech).urgency === "EMERGENCY";
}

// Convenience: given a published rule set, evaluate caller speech emergency.
export function emergencyFromPublished(
  published: PublishedRule<EscalationRoutingRule> | null,
  callerSpeech: string,
): boolean {
  return isEmergency(callerSpeech, published?.data ?? null);
}

export { toZonedParts, zonedDateStr, tzOffsetMinutes };
