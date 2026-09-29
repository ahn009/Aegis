import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleInboundSms } from "@/lib/domain/messaging";
import { ok, errorBody, ApiError } from "@/lib/errors";
import { verifySignature } from "@/lib/webhook-security";

// Inbound SMS webhook (Twilio-style). SPEC: verify signatures; dedup on
// (provider, CallSid + event); acknowledge <500ms, heavy work async.

const SmsSchema = z.object({
  From: z.string(),
  Body: z.string(),
  MessageSid: z.string().optional(),
  To: z.string().optional(),
  organizationId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Messaging integration unavailable", { status: 503 });
  }
  try {
    const rawBody = await req.text();
    // Signature verification (SPEC)
    if (!verifySignature(req.headers.get("x-velora-sig"), rawBody)) {
      throw ApiError.unauthorized("Invalid webhook signature");
    }
    let body: Record<string, string> = {};
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      try { body = JSON.parse(rawBody); } catch {}
    } else {
      new URLSearchParams(rawBody).forEach((v, k) => { body[k] = v; });
    }
    const parsed = SmsSchema.parse(body);
    const orgId = parsed.organizationId ?? (await firstOrgId());
    if (!orgId) return Response.json({ ok: false, error: "no org" }, { status: 400 });

    // Dedup on (provider=sms, externalId=MessageSid)
    const externalId = parsed.MessageSid ?? `sms-${parsed.From}-${Date.now()}`;
    try {
      await db.webhookEvent.create({
        data: {
          organizationId: orgId,
          provider: "sms",
          externalId,
          event: "inbound",
          payloadJson: JSON.stringify(body),
          signatureValid: true,
        },
      });
    } catch {
      // Unique violation → already processed. Acknowledge idempotently.
      return Response.json(ok({ deduped: true }));
    }

    await handleInboundSms(orgId, parsed.From, parsed.Body);

    return Response.json(ok({ received: true }));
  } catch (err) {
    const { status, body } = errorBody(err);
    return Response.json(body, { status });
  }
}

async function firstOrgId(): Promise<string | null> {
  const org = await db.organization.findFirst({ select: { id: true } });
  return org?.id ?? null;
}
