import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession, setSessionCookie } from "@/lib/session";
import { checkLockout, recordFailedLogin, recordSuccessfulLogin, assertLockout } from "@/lib/rate-limit";
import { ok, errorBody } from "@/lib/errors";
import { withPublicApi, parseBody, getClientIp } from "@/lib/http";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  organizationId: z.string().min(1).optional(),
});

export const POST = withPublicApi(async (req) => {
  try {
    const { email, password, organizationId } = await parseBody(req, LoginSchema);
    const clientIp = getClientIp(req);

    // 1. Lockout check (don't reveal whether email exists)
    const lockout = await checkLockout(email, clientIp);
    assertLockout(lockout);

    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { memberships: true },
    });
    // Constant-ish timing: always verify a hash
    const valid = user ? verifyPassword(password, user.passwordHash) : false;

    if (!user || !valid || user.memberships.length === 0) {
      const res = await recordFailedLogin(email, clientIp);
      // If now locked, surface that
      if (!res.ok) assertLockout(res);
      return Response.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid email or password" } },
        { status: 401 },
      );
    }

    await recordSuccessfulLogin(email);
    const membership = organizationId
      ? user.memberships.find((item) => item.organizationId === organizationId)
      : user.memberships.toSorted((a, b) => a.organizationId.localeCompare(b.organizationId))[0];
    if (!membership) return Response.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid email or password" } },
      { status: 401 },
    );
    const { token } = await createSession(user.id, membership.organizationId, {
      ip: clientIp,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    await setSessionCookie(token);

    return Response.json(ok({
      user: { id: user.id, email: user.email, name: user.name },
      organization: { id: membership.organizationId, role: membership.role },
    }));
  } catch (err) {
    const { status, body } = errorBody(err);
    return Response.json(body, { status });
  }
});
