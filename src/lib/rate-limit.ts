import { db } from "./db";
import { ApiError } from "./errors";

// In-process rate limiter for login. SPEC: rate limiting + lockout.
// Production would use Redis; this is per-instance. Sufficient for single-node.

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec?: number;
}

export async function checkLockout(email: string): Promise<RateLimitResult> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return { ok: true }; // don't reveal existence; fail later
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const retryAfterSec = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
    return { ok: false, retryAfterSec };
  }
  return { ok: true };
}

export async function recordFailedLogin(email: string): Promise<RateLimitResult> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return { ok: true };
  const failed = user.failedLogins + 1;
  const lockedUntil = failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS) : null;
  // Clear stale lockout if expired
  await db.user.update({
    where: { id: user.id },
    data: {
      failedLogins: failed,
      lockedUntil: lockedUntil ?? (user.lockedUntil && user.lockedUntil <= new Date() ? null : user.lockedUntil),
    },
  });
  if (lockedUntil) {
    return { ok: false, retryAfterSec: Math.ceil(LOCKOUT_MS / 1000) };
  }
  return { ok: true };
}

export async function recordSuccessfulLogin(email: string): Promise<void> {
  await db.user.updateMany({
    where: { email },
    data: { failedLogins: 0, lockedUntil: null },
  });
}

export function assertLockout(res: RateLimitResult): void {
  if (!res.ok && res.retryAfterSec) {
    throw ApiError.lockedOut(res.retryAfterSec);
  }
}
