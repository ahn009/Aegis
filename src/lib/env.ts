// Prototype environment defaults. Phase 1 must validate production settings at startup.

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) {
    // In dev we allow missing secrets by falling back to deterministic dev values,
    // but warn loudly. Production must set them.
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Missing required env var: ${name}`);
    }
    console.warn(`[env] ${name} not set — using insecure dev fallback`);
    return fallback ?? "";
  }
  return v;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  // 32-byte base64 key for AES-256-GCM envelope encryption of integration creds.
  // Dev fallback is a deterministic key so seeded creds round-trip.
  encryptionKey:
    process.env.VELORA_ENCRYPTION_KEY ??
    "dev-velora-encryption-key-DO-NOT-USE-IN-PROD-32b!",
  sessionSecret:
    process.env.VELORA_SESSION_SECRET ??
    "dev-velora-session-secret-DO-NOT-USE-IN-PROD",
  aiProvider: (process.env.VELORA_AI_PROVIDER ?? "mock") as "mock" | "openai",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  // Idle/absolute session expiry (SPEC: 7d idle / 30d absolute)
  sessionIdleMs: 7 * 24 * 60 * 60 * 1000,
  sessionAbsoluteMs: 30 * 24 * 60 * 60 * 1000,
  // Appointment hold TTL (SPEC: 120 min)
  holdTtlMs: 120 * 60 * 1000,
  // Missed-call recovery cap (SPEC: 1 per caller per 4h)
  missedCallWindowMs: 4 * 60 * 60 * 1000,
  appBaseUrl: process.env.VELORA_APP_BASE_URL ?? "http://localhost:3000",
};

// Tag literal so "server-only" import is always side-effectful.
export default env;
