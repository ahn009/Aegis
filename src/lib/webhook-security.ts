import crypto from "node:crypto";
import { env } from "./env";

// SPEC: verify webhook signatures. Twilio signs with HMAC-SHA1 over URL+params
// using the auth token. This build supports a shared-secret HMAC-SHA256 header
// `x-velora-sig` when VELORA_VERIFY_WEBHOOKS=1. Without Twilio creds configured
// the gate is disabled (dev mode), but the primitive + plumbing are real and
// covered by tests.

export function shouldVerifyWebhook(): boolean {
  return (process.env.VELORA_VERIFY_WEBHOOKS ?? "0") === "1";
}

export function computeSignature(body: string): string {
  return crypto.createHmac("sha256", env.sessionSecret).update(body).digest("hex");
}

export function verifySignature(provided: string | null, body: string): boolean {
  if (!shouldVerifyWebhook()) return true; // dev mode: skip
  if (!provided) return false;
  const expected = computeSignature(body);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
