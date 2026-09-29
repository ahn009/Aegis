import { db } from "@/lib/db";
import { ApiError, ok } from "@/lib/errors";
import { withApi } from "@/lib/http";

// GET /api/contacts/[id] — contact detail with related calls, leads, appointments.
export const GET = withApi(async ({ user, params }) => {
  const id = String(params.id);
  const contact = await db.contact.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!contact) throw ApiError.notFound("Contact not found");
  const [calls, leads, appointments] = await Promise.all([
    db.call.findMany({
      where: { organizationId: user.organizationId, contactId: id },
      orderBy: { startedAt: "desc" },
      take: 20,
      select: { id: true, status: true, urgency: true, serviceType: true, startedAt: true, durationSeconds: true, conversation: { select: { id: true, state: true, outcome: true } } },
    }),
    db.lead.findMany({
      where: { organizationId: user.organizationId, contactId: id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, status: true, urgency: true, serviceType: true, createdAt: true, inServiceArea: true },
    }),
    db.appointment.findMany({
      where: { organizationId: user.organizationId, contactId: id, deletedAt: null },
      orderBy: { startTime: "desc" },
      take: 20,
      select: { id: true, status: true, serviceType: true, startTime: true, endTime: true, notes: true, holdUntil: true },
    }),
  ]);
  return Response.json(ok({ contact, calls, leads, appointments }));
});
