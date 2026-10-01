import { NextRequest } from "next/server";
import { z } from "zod";
import { processTwilioWebhook } from "@/lib/webhook-transaction";
import { handleInboundSms } from "@/lib/domain/messaging";
import { ok, errorBody, ApiError } from "@/lib/errors";
import { parseVerifiedTwilioForm, resolveTwilioOrganization } from "@/lib/webhook-security";
import { normalizePhone } from "@/lib/phone";

// Inbound SMS webhook (Twilio-style). SPEC: verify signatures; dedup on
// (provider, CallSid + event); acknowledge <500ms, heavy work async.

const SmsSchema = z.object({
  From: z.string(),
  Body: z.string(),
  MessageSid: z.string().min(1),
  To: z.string().min(1),
});

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Messaging integration unavailable", { status: 503 });
  }
  try {
    const parsed = SmsSchema.parse(await parseVerifiedTwilioForm(req));
    const fromPhone = normalizePhone(parsed.From);
    if (!fromPhone) throw ApiError.badRequest("Invalid sender number");
    const orgId = await resolveTwilioOrganization(parsed.To);

    const processed = await processTwilioWebhook(
      { organizationId: orgId, externalId: parsed.MessageSid, event: "inbound", payload: { MessageSid: parsed.MessageSid, To: parsed.To } },
      (tx) => handleInboundSms(orgId, fromPhone, parsed.Body, tx),
    );
    if (processed.deduped) return Response.json(ok({ deduped: true }));

    return Response.json(ok({ received: true }));
  } catch (err) {
    const { status, body } = errorBody(err);
    return Response.json(body, { status });
  }
}
