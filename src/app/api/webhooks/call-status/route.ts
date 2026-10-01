import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { endCall } from "@/lib/domain/calls";
import { ok, errorBody, ApiError } from "@/lib/errors";
import { parseVerifiedTwilioForm, resolveTwilioOrganization } from "@/lib/webhook-security";
import { normalizePhone } from "@/lib/phone";
import { processTwilioWebhook } from "@/lib/webhook-transaction";

// Call status callback (simulated Twilio). Dedup on (twilio, CallSid+Status).
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Voice integration unavailable", { status: 503 });
  }
  try {
    const body = await parseVerifiedTwilioForm(req);
    const callSid = body.CallSid;
    const status = body.CallStatus;
    if (!callSid || !status) throw ApiError.badRequest("Missing call ID or status");
    const call = await db.call.findUnique({ where: { callSid } });
    if (!call) throw ApiError.notFound("Call not found");
    const orgId = call.organizationId;
    if (body.To) {
      const toPhone = normalizePhone(body.To);
      if (!toPhone || toPhone !== call.toPhone || await resolveTwilioOrganization(toPhone) !== orgId) {
        throw ApiError.notFound("Destination does not match call");
      }
    }

    const externalId = `${callSid}#${status}`;
    const mapped = mapStatus(status);
    const processed = await processTwilioWebhook(
      { organizationId: orgId, externalId, event: `status:${status}`, payload: { CallSid: callSid, CallStatus: status } },
      async (tx) => { if (mapped) await endCall(orgId, call.id, mapped.status, mapped.outcome, tx); },
    );
    if (processed.deduped) return Response.json(ok({ deduped: true }));
    return Response.json(ok({ updated: true }));
  } catch (err) {
    const { status, body } = errorBody(err);
    return Response.json(body, { status });
  }
}

function mapStatus(s: string): { status: string; outcome?: string } | null {
  switch (s.toLowerCase()) {
    case "completed": return { status: "COMPLETED", outcome: "ENDED" };
    case "no-answer":
    case "no_answer": return { status: "MISSED", outcome: "ENDED" };
    case "busy": return { status: "MISSED", outcome: "ENDED" };
    case "failed": return { status: "FAILED", outcome: "ENDED" };
    case "canceled": return { status: "FAILED", outcome: "ENDED" };
    default: return null;
  }
}
