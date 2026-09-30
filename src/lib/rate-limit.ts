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

async function checkKey(key: string, limit: number, now: Date): Promise<RateLimitResult> {
  const since = new Date(now.getTime() - WINDOW_MS);
  const attempts = await db.loginAttempt.findMany({
    where: { keyHash: key, createdAt: { gt: since } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { createdAt: true },
  });
  if (attempts.length < limit) return { ok: true };
  const retryAfterSec = Math.max(1, Math.ceil((attempts[0]!.createdAt.getTime() + WINDOW_MS - now.getTime()) / 1000));
  return { ok: false, retryAfterSec };
}

export async function checkLockout(email: string, trustedIp?: string): Promise<RateLimitResult> {
  const now = new Date();
  const account = await checkKey(keyHash("email", email), EMAIL_FAILURE_LIMIT, now);
  if (!account.ok) return account;
  if (trustedIp) return checkKey(keyHash("ip", trustedIp), IP_FAILURE_LIMIT, now);
  return { ok: true };
}

export async function recordFailedLogin(email: string, trustedIp?: string): Promise<RateLimitResult> {
  const keys = [keyHash("email", email), ...(trustedIp ? [keyHash("ip", trustedIp)] : [])];
  await db.loginAttempt.createMany({ data: keys.map((key) => ({ keyHash: key })) });
  // Attempts live in the shared database, so unknown and known accounts use the
  // same limit across application instances.
  return checkLockout(email, trustedIp);
}

export async function pruneExpiredLoginAttempts(now = new Date()): Promise<number> {
  const result = await db.loginAttempt.deleteMany({
    where: { createdAt: { lte: new Date(now.getTime() - WINDOW_MS) } },
  });
  return result.count;
}

export async function recordSuccessfulLogin(email: string): Promise<void> {
  await db.loginAttempt.deleteMany({ where: { keyHash: keyHash("email", email) } });
  await db.user.updateMany({
    where: { email: email.trim().toLowerCase() },
    data: { failedLogins: 0, lockedUntil: null },
  });
}

export function assertLockout(res: RateLimitResult): void {
  if (!res.ok && res.retryAfterSec) throw ApiError.lockedOut(res.retryAfterSec);
}
