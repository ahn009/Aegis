
// E.164 normalization. Conservative: accepts US/Canada + generic international.
// Used as the contact dedup key (org_id + phoneE164). SPEC: contact dedup by E.164.

const US_NANP = /^(\+?1)?(\d{10})$/;

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;

  // Extract digits & leading +
  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return null;

  // North American Numbering Plan: 10 digits → +1
  if (digits.length === 10) {
    if (!/^(\d{10})$/.test(digits)) return null;
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  // International with explicit +
  if (plus && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  // Last resort: assume the leading digits are a country code
  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

export function isValidE164(phone: string | null | undefined): phone is string {
  if (!phone) return false;
  return /^\+\d{8,15}$/.test(phone);
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  // +12145551234 -> +1 (214) 555-**34
  const m = phone.match(/^\+(\d{1,3})(\d{3})(\d{3})(\d{2})(\d{2})$/);
  if (m) return `+${m[1]} (${m[2]}) ${m[3]}-${m[4]}**`;
  return phone;
}

export function maskZip(zip: string | null | undefined): string {
  if (!zip) return "—";
  if (zip.length <= 2) return "*".repeat(zip.length);
  return zip.slice(0, 2) + "*".repeat(Math.max(0, zip.length - 2));
}
