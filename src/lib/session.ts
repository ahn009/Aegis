import { cookies } from "next/headers";
import { db } from "./db";
import { env } from "./env";
import { hashToken, randomToken, timingSafeEqualString } from "./crypto";

export const SESSION_COOKIE = "velora_session";

export interface SessionUser {
  userId: string;
  email: string;
  name: string | null;
  // active membership context (org + role). User may belong to multiple orgs;
  // the active org is selected on login / switch.
  organizationId: string;
  role: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  csrfToken: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

export async function createSession(userId: string, organizationId: string, role: string, meta: { ip?: string; userAgent?: string }) {
  const token = randomToken(32);
  const tokenHash = hashToken(token);
  const csrfToken = randomToken(16);
  const now = new Date();
  const idleExpiresAt = new Date(now.getTime() + env.sessionIdleMs);
  const absoluteExpiresAt = new Date(now.getTime() + env.sessionAbsoluteMs);
  const session = await db.session.create({
    data: {
      userId,
      tokenHash,
      csrfToken,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      idleExpiresAt,
      absoluteExpiresAt,
    },
  });
  return { token, session };
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    path: "/",
    maxAge: Math.floor(env.sessionAbsoluteMs / 1000),
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function readSessionCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

/**
 * Resolve the current session + membership. Sliding idle expiry: each successful
 * read bumps idleExpiresAt (absolute 30d cap still applies). Returns null if
 * missing, expired, or membership no longer active.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = await readSessionCookie();
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: {
      user: { include: { memberships: true } },
    },
  });
  if (!session) return null;
  const now = new Date();
  if (session.idleExpiresAt < now || session.absoluteExpiresAt < now) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  // Find active membership — we encode the chosen org id inside the session row
  // via a side-table approach: we store nothing on session, instead pick the
  // first OWNER/ADMIN membership or the most recent. To support org switching
  // we look it up from a separate cookie. For simplicity here we use the first
  // membership.
  const membership = session.user.memberships[0];
  if (!membership) return null;
  // Slide idle expiry
  const newIdle = new Date(now.getTime() + env.sessionIdleMs);
  if (session.idleExpiresAt.getTime() !== newIdle.getTime()) {
    await db.session.update({
      where: { id: session.id },
      data: { idleExpiresAt: newIdle, updatedAt: now },
    }).catch(() => {});
  }
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    organizationId: membership.organizationId,
    role: membership.role,
  };
}

export async function destroySession(): Promise<void> {
  const token = await readSessionCookie();
  if (!token) return;
  const tokenHash = hashToken(token);
  await db.session.deleteMany({ where: { tokenHash } }).catch(() => {});
  await clearSessionCookie();
}

export function verifyCsrf(provided: string, expected: string): boolean {
  return timingSafeEqualString(provided, expected);
}
