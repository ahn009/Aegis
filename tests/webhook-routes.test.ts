import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getExpectedTwilioSignature } from "twilio";
import { db } from "../src/lib/db";
import { env } from "../src/lib/env";
import { POST as voice } from "../src/app/api/webhooks/voice/route";
import { POST as sms } from "../src/app/api/webhooks/sms/route";
import { POST as status } from "../src/app/api/webhooks/call-status/route";

const accountSid = `AC${"a".repeat(32)}`;
const authToken = "b".repeat(32);
const baseUrl = "http://localhost:3000";
const original = { accountSid: env.twilioAccountSid, authToken: env.twilioAuthToken, appBaseUrl: env.appBaseUrl };

function callback(path: string, params: Record<string, string>, signed = true) {
  const url = `${baseUrl}${path}`;
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": signed ? getExpectedTwilioSignature(authToken, url, params) : "forged",
    },
    body: new URLSearchParams(params).toString(),
  });
}

describe("Twilio callback routes", () => {
  beforeAll(() => {
    env.twilioAccountSid = accountSid;
    env.twilioAuthToken = authToken;
    env.appBaseUrl = baseUrl;
  });
  afterAll(() => {
    env.twilioAccountSid = original.accountSid;
    env.twilioAuthToken = original.authToken;
    env.appBaseUrl = original.appBaseUrl;
  });

  it("routes a signed call by destination, ignores supplied organization ID, and deduplicates", async () => {
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    const payload = {
      AccountSid: accountSid,
      CallSid: `CA${"1".repeat(32)}`,
      From: "+12145551234",
      To: "+12145550100",
      organizationId: "attacker-selected-organization",
    };
    const first = await voice(callback("/api/webhooks/voice", payload));
    expect(first.status).toBe(200);
    expect((await db.call.findUniqueOrThrow({ where: { callSid: payload.CallSid } })).organizationId).toBe(org.id);
    const replay = await voice(callback("/api/webhooks/voice", payload));
    expect(replay.status).toBe(200);
    expect((await replay.json()).data.deduped).toBe(true);
    expect((await voice(callback("/api/webhooks/voice", { ...payload, CallSid: `CA${"2".repeat(32)}` }, false))).status).toBe(401);
  });

  it("rejects an unmapped SMS destination and accepts a mapped signed message once", async () => {
    const payload = {
      AccountSid: accountSid,
      MessageSid: `SM${"3".repeat(32)}`,
      From: "+12145551234",
      To: "+12145550999",
      Body: "Hello",
    };
    expect((await sms(callback("/api/webhooks/sms", payload))).status).toBe(404);
    const mapped = { ...payload, To: "+12145550100" };
    expect((await sms(callback("/api/webhooks/sms", mapped))).status).toBe(200);
    const replay = await sms(callback("/api/webhooks/sms", mapped));
    expect((await replay.json()).data.deduped).toBe(true);
    expect(await db.smsMessage.count({ where: { body: "Hello", direction: "INBOUND" } })).toBe(1);
  });

  it("uses a stored call tenant for signed status updates and rejects a mismatched destination", async () => {
    const callPayload = { AccountSid: accountSid, CallSid: `CA${"4".repeat(32)}`, From: "+12145551234", To: "+12145550100" };
    expect((await voice(callback("/api/webhooks/voice", callPayload))).status).toBe(200);
    const statusPayload = { ...callPayload, CallStatus: "completed" };
    expect((await status(callback("/api/webhooks/call-status", { ...statusPayload, To: "+12145550999" }))).status).toBe(404);
    expect((await status(callback("/api/webhooks/call-status", statusPayload))).status).toBe(200);
    expect((await db.call.findUniqueOrThrow({ where: { callSid: callPayload.CallSid } })).status).toBe("COMPLETED");
  });
});
