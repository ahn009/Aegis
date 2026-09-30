import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { startInboundCall } from "@/lib/domain/calls";
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

    // Dedup on (twilio, CallSid)
    try {
      await db.webhookEvent.create({
        data: { organizationId: orgId, provider: "twilio", externalId: callSid, event: "voice", payloadJson: JSON.stringify({ CallSid: callSid, To: toPhone }), signatureValid: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return Response.json(ok({ deduped: true, callSid }));
      }
      throw error;
    }

    const result = await startInboundCall({ organizationId: orgId, callSid, fromPhone, toPhone });

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
