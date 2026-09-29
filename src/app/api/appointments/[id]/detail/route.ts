import { db } from "@/lib/db";
import { ApiError, ok } from "@/lib/errors";
import { withApi } from "@/lib/http";

// GET /api/appointments/[id]/detail — full appointment detail (contact, call,
// conversation link, notes, hold). Org-scoped.
export const GET = withApi(async ({ user, params }) => {
  const id = String(params.id);
  const appt = await db.appointment.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: {
      contact: { select: { id: true, name: true, phoneE164: true, addressStreet: true, addressCity: true, addressState: true, addressZip: true, email: true } },
      call: { select: { id: true, callSid: true, conversation: { select: { id: true, state: true, outcome: true } } } },
    },
  });
  if (!appt) throw ApiError.notFound("Appointment not found");
  return Response.json(ok(appt));
});
