import { z } from "zod";
import { db } from "@/lib/db";
import { startInboundCall } from "@/lib/domain/calls";
import { randomToken } from "@/lib/crypto";
import { normalizePhone } from "@/lib/phone";
import { ApiError, ok } from "@/lib/errors";
import { withApi, parseBody } from "@/lib/http";
import { requireSimulatorAccess } from "@/lib/simulator-access";

const StartSchema = z.object({
  fromPhone: z.string(),
  // optional: simulate a specific scenario
  scenario: z.enum(["normal", "emergency", "out_of_area"]).default("normal"),
});

// POST /api/simulate-call/start — creates a simulated inbound call + conversation.
export const POST = withApi(async ({ user, req }) => {
  requireSimulatorAccess();
  const { fromPhone, scenario } = await parseBody(req, StartSchema);
  const phone = normalizePhone(fromPhone);
  if (!phone) throw ApiError.badRequest("Invalid fromPhone");

  const org = await db.organization.findUniqueOrThrow({ where: { id: user.organizationId } });
  const callSid = "CA" + randomToken(16).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);
  const result = await startInboundCall({
    organizationId: user.organizationId,
    callSid,
    fromPhone: phone,
    toPhone: org.defaultPhone ?? "",
  });

  // If emergency scenario, we just record it; the orchestrator's deterministic
  // emergency check handles escalation when the caller utters a keyword.
  return Response.json(ok({
    call: { id: result.call.id, callSid: result.call.callSid, fromPhone: result.call.fromPhone },
    conversation: { id: result.conversation.id, state: result.conversation.state },
    scenario,
  }));
});
