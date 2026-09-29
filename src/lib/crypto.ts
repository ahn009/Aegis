import crypto from "node:crypto";
import { env } from "./env";

const ALGO = "aes-256-gcm";

// Derive a fixed 32-byte key from the configured secret (deterministic in dev).
function key(): Buffer {
  return crypto.createHash("sha256").update(env.encryptionKey).digest();
}

export interface EncryptedBlob {
  iv: string; // base64
  ct: string; // base64 ciphertext+tag
}

/**
 * AES-256-GCM envelope encryption for integration credentials.
 * Returned blobs are stored at rest; never returned to clients.
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // pack iv + tag + ct for storage as a single string
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(".");
}

export function decrypt(blob: string): string {
  const [ivB64, tagB64, ctB64] = blob.split(".");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("malformed encrypted blob");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const decipher = crypto.createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/** Random opaque token (url-safe). */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** SHA-256 hash of a token for storage (sessions, invitations). */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Constant-time string compare. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
