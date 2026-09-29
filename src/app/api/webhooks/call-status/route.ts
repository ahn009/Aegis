import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { endCall } from "@/lib/domain/calls";
import { ok, errorBody } from "@/lib/errors";

// Call status callback (simulated Twilio). Dedup on (twilio, CallSid+Status).
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const obj: Record<string, string> = {};
    form.forEach((v, k) => { obj[k] = String(v); });
    let body = obj;
    if (Object.keys(obj).length === 0) {
      try { body = await req.json(); } catch {}
    }
    const callSid = body.CallSid;
    const status = body.CallStatus ?? "completed";
    const orgId = body.organizationId ?? (await firstOrgId());
    if (!callSid || !orgId) return Response.json({ ok: false, error: "missing CallSid/org" }, { status: 400 });

    const externalId = `${callSid}#${status}`;
    try {
      await db.webhookEvent.create({
        data: { organizationId: orgId, provider: "twilio", externalId, event: `status:${status}`, payloadJson: JSON.stringify(body), signatureValid: true },
      });
    } catch {
      return Response.json(ok({ deduped: true }));
    }
    const call = await db.call.findUnique({ where: { callSid } });
    if (call) {
      const mapped = mapStatus(status);
      if (mapped) await endCall(orgId, call.id, mapped.status, mapped.outcome);
    }
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

async function firstOrgId(): Promise<string | null> {
  const org = await db.organization.findFirst({ select: { id: true } });
  return org?.id ?? null;
}
