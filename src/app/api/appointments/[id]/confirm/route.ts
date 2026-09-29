import { confirmAppointment } from "@/lib/domain/appointments";
import { ok } from "@/lib/errors";
import { withApi } from "@/lib/http";

export const POST = withApi(async ({ user, params }) => {
  const id = String(params.id);
  await confirmAppointment(user.organizationId, id, user.userId, "USER");
  return Response.json(ok({ confirmed: true }));
});
