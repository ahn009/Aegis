import { z } from "zod";
import { parseBody, withApi } from "@/lib/http";
import { ok } from "@/lib/errors";
import { switchSessionOrganization } from "@/lib/session";

const SwitchSchema = z.object({ organizationId: z.string().min(1) });

export const POST = withApi(async ({ req }) => {
  const { organizationId } = await parseBody(req, SwitchSchema);
  const user = await switchSessionOrganization(organizationId);
  return Response.json(ok({ user }));
});
