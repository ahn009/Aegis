import { db } from "@/lib/db";
import { ok } from "@/lib/errors";
import { withApi } from "@/lib/http";

export const GET = withApi(async ({ user }) => {
  const memberships = await db.membership.findMany({
    where: { userId: user.userId },
    select: { role: true, organization: { select: { id: true, name: true, timezone: true } } },
    orderBy: { organization: { name: "asc" } },
  });
  return Response.json(ok({ organizations: memberships.map(({ organization, role }) => ({ ...organization, role })) }));
});
