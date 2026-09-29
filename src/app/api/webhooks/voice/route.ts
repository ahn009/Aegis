import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { startInboundCall } from "@/lib/domain/calls";
import { randomToken } from "@/lib/crypto";
import { normalizePhone } from "@/lib/phone";
import { verifySignature } from "@/lib/webhook-security";
import { ok, errorBody, ApiError } from "@/lib/errors";

// Simulated Twilio voice webhook. In production this would return TwiML and
// hand off to the voice-gateway. Here it records the inbound call + returns a
// JSON TwiML-ish payload the simulator consumes.
//
// SPEC: verify signatures; dedup on (provider, CallSid + event); ack <500ms.

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    // Signature verification (SPEC). Body is form-encoded OR json.
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
    const callSid = body.CallSid ?? "CA" + randomToken(16).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);
    const fromPhone = normalizePhone(body.From ?? body.from);
    const toPhone = body.To ?? body.to ?? "";
    const orgId = body.organizationId ?? (await firstOrgId());
    if (!orgId || !fromPhone) return Response.json({ ok: false, error: "missing org or From" }, { status: 400 });

    // Dedup on (twilio, CallSid)
    const existing = await db.webhookEvent.findUnique({
      where: { organizationId_provider_externalId: { organizationId: orgId, provider: "twilio", externalId: callSid } },
    });
    if (existing) {
      return Response.json(ok({ deduped: true, callSid }));
    }
    await db.webhookEvent.create({
      data: { organizationId: orgId, provider: "twilio", externalId: callSid, event: "voice", payloadJson: JSON.stringify(body), signatureValid: true },
    });

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

async function firstOrgId(): Promise<string | null> {
  const org = await db.organization.findFirst({ select: { id: true } });
  return org?.id ?? null;
}
