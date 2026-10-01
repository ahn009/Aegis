import crypto from "node:crypto";
import { db } from "./db";
import { env } from "./env";
import { ApiError } from "./errors";

const WINDOW_MS = 15 * 60 * 1000;
const EMAIL_FAILURE_LIMIT = 5;
const IP_FAILURE_LIMIT = 30;

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec?: number;
}

function keyHash(kind: "email" | "ip", value: string): string {
  const normalized = kind === "email" ? value.trim().toLowerCase() : value;
  return crypto.createHmac("sha256", env.sessionSecret).update(`${kind}:${normalized}`).digest("hex");
}

/** Reserve a login attempt before password verification. One atomic upsert per
 * key gives all app instances the same bounded admission count. */
export async function consumeLoginAttempt(email: string, trustedIp?: string): Promise<RateLimitResult> {
  const account = await incrementCounter(keyHash("email", email), EMAIL_FAILURE_LIMIT);
  if (!account.ok) return account;
  if (trustedIp) return incrementCounter(keyHash("ip", trustedIp), IP_FAILURE_LIMIT);
  return { ok: true };
}

async function incrementCounter(key: string, limit: number): Promise<RateLimitResult> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - WINDOW_MS);
  const rows = await db.$queryRaw<{ count: number; windowStartedAt: Date }[]>`
    INSERT INTO "LoginCounter" ("keyHash", "count", "windowStartedAt")
    VALUES (${key}, 1, ${now})
    ON CONFLICT ("keyHash") DO UPDATE SET
      "count" = CASE
        WHEN "windowStartedAt" <= ${cutoff} THEN 1
        WHEN "count" >= ${limit} THEN "count"
        ELSE "count" + 1
      END,
      "windowStartedAt" = CASE
        WHEN "windowStartedAt" <= ${cutoff} THEN ${now}
        ELSE "windowStartedAt"
      END
    RETURNING "count", "windowStartedAt"
  `;
  const row = rows[0]!;
  if (row.count < limit) return { ok: true };
  return {
    ok: false,
    retryAfterSec: Math.max(1, Math.ceil((row.windowStartedAt.getTime() + WINDOW_MS - now.getTime()) / 1000)),
  };
}

export async function pruneExpiredLoginAttempts(now = new Date()): Promise<number> {
  const counters = await db.loginCounter.deleteMany({ where: { windowStartedAt: { lte: new Date(now.getTime() - WINDOW_MS) } } });
  const result = await db.loginAttempt.deleteMany({
    where: { createdAt: { lte: new Date(now.getTime() - WINDOW_MS) } },
  });
  return counters.count + result.count;
}

export async function recordSuccessfulLogin(email: string): Promise<void> {
  await db.loginCounter.deleteMany({ where: { keyHash: keyHash("email", email) } });
  await db.loginAttempt.deleteMany({ where: { keyHash: keyHash("email", email) } });
  await db.user.updateMany({
    where: { email: email.trim().toLowerCase() },
    data: { failedLogins: 0, lockedUntil: null },
  });
}

export function assertLockout(res: RateLimitResult): void {
  if (!res.ok && res.retryAfterSec) throw ApiError.lockedOut(res.retryAfterSec);
}
