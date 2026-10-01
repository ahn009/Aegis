import { NextRequest } from "next/server";
import { startInboundCall } from "@/lib/domain/calls";
import { processTwilioWebhook } from "@/lib/webhook-transaction";
import { normalizePhone } from "@/lib/phone";
import { parseVerifiedTwilioForm, resolveTwilioOrganization } from "@/lib/webhook-security";
import { ok, errorBody, ApiError } from "@/lib/errors";

// Simulated Twilio voice webhook. In production this would return TwiML and
// hand off to the voice-gateway. Here it records the inbound call + returns a
// JSON TwiML-ish payload the simulator consumes.
//
// SPEC: verify signatures; dedup on (provider, CallSid + event); ack <500ms.

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Voice integration unavailable", { status: 503 });
  }
  try {
    const body = await parseVerifiedTwilioForm(req);
    const callSid = body.CallSid;
    const fromPhone = normalizePhone(body.From);
    const toPhone = normalizePhone(body.To);
    if (!callSid || !fromPhone || !toPhone) throw ApiError.badRequest("Missing call ID or phone number");
    const orgId = await resolveTwilioOrganization(toPhone);

    const processed = await processTwilioWebhook(
      { organizationId: orgId, externalId: callSid, event: "voice", payload: { CallSid: callSid, To: toPhone } },
      (tx) => startInboundCall({ organizationId: orgId, callSid, fromPhone, toPhone }, tx),
    );
    if (processed.deduped) return Response.json(ok({ deduped: true, callSid }));
    const result = processed.result;

    // TwiML-ish response (JSON form for the simulator)
    return Response.json(ok({
      callSid,
      callId: result.call.id,
      conversationId: result.conversation.id,
      twiml: {
        Say: "Thanks for calling Velora HVAC. Please hold while I connect you to our virtual receptionist.",
        Connect: { conversationId: result.conversation.id },
      },
    }));
  } catch (err) {
    const { status, body } = errorBody(err);
    return Response.json(body, { status });
  }
}
