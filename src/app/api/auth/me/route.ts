import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ok, errorBody } from "@/lib/errors";

// Public-ish: returns 200 with null user if not authed (so the client can render
// the login page without an error). Errors still mapped.
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json(ok({ user: null }));
    const org = await db.organization.findUnique({ where: { id: user.organizationId }, select: { id: true, name: true, slug: true, timezone: true } });
    return Response.json(ok({ user, organization: org }));
  } catch (err) {
    const { status, body } = errorBody(err);
    return Response.json(body, { status });
  }
}
