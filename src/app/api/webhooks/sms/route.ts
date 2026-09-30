import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
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

    // Dedup on (provider=sms, externalId=MessageSid)
    try {
      await db.webhookEvent.create({
        data: {
          organizationId: orgId,
          provider: "twilio",
          externalId: parsed.MessageSid,
          event: "inbound",
          payloadJson: JSON.stringify({ MessageSid: parsed.MessageSid, To: parsed.To }),
          signatureValid: true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return Response.json(ok({ deduped: true }));
      }
      throw error;
    }

    await handleInboundSms(orgId, fromPhone, parsed.Body);

    return Response.json(ok({ received: true }));
  } catch (err) {
    const { status, body } = errorBody(err);
    return Response.json(body, { status });
  }
}
