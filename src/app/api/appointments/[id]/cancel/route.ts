import { z } from "zod";
import { cancelAppointment } from "@/lib/domain/appointments";
import { ok } from "@/lib/errors";
import { withApi, parseBody } from "@/lib/http";

const Schema = z.object({ reason: z.string().min(1).max(200) });

export const POST = withApi(async ({ user, params, req }) => {
  const id = String(params.id);
  const { reason } = await parseBody(req, Schema);
  await cancelAppointment(user.organizationId, id, reason, user.userId, "USER");
  return Response.json(ok({ cancelled: true }));
}, { role: "DISPATCHER" });
