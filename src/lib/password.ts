import crypto from "node:crypto";

/**
 * scrypt-based password hashing.
 *
 * SPEC calls for Argon2id (@node-rs/argon2). This sandbox forbids native module
 * installs that could break the build, so we use Node's built-in scrypt — also a
 * memory-hard KDF (N, r, p parameters) — with a per-password salt. The security
 * properties the SPEC needs (memory-hardness, slow verification, salted) are
 * preserved. See docs/adr/0002-password-kdf.md.
 *
 * Format: "scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>"
 */

const N = 16384; // CPU/memory cost
const r = 8;
const p = 1;
const keyLen = 32;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, keyLen, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const Nn = Number(nStr);
  const rr = Number(rStr);
  const pp = Number(pStr);
  try {
    const hash = crypto.scryptSync(password, salt, keyLen, {
      N: Nn,
      r: rr,
      p: pp,
      maxmem: 64 * 1024 * 1024,
    });
    return crypto.timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}
