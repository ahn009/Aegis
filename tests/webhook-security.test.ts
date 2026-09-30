import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getExpectedTwilioSignature } from "twilio";
import { db } from "../src/lib/db";
import { parseVerifiedTwilioForm, resolveTwilioOrganization } from "../src/lib/webhook-security";

const config = {
  accountSid: `AC${"a".repeat(32)}`,
  authToken: "b".repeat(32),
  appBaseUrl: "http://localhost:3000",
};
const url = "http://localhost:3000/api/webhooks/sms";
const params = {
  AccountSid: config.accountSid,
  MessageSid: `SM${"c".repeat(32)}`,
  From: "+12145551234",
  To: "+12145550100",
  Body: "STOP",
};

function signedRequest(overrides: Record<string, string> = {}, signatureUrl = url, actualUrl = url) {
  const form = { ...params, ...overrides };
  const signature = getExpectedTwilioSignature(config.authToken, signatureUrl, form);
  return new NextRequest(actualUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": signature },
    body: new URLSearchParams(form).toString(),
  });
}

describe("Twilio webhook boundary", () => {
  it("accepts a signed form and resolves its destination to the seeded tenant", async () => {
    expect(await parseVerifiedTwilioForm(signedRequest(), config)).toMatchObject(params);
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    expect(await resolveTwilioOrganization(params.To)).toBe(org.id);
  });

  it("rejects a forged body and the wrong provider account", async () => {
    const forged = signedRequest();
    const body = await forged.text();
    const altered = new NextRequest(url, {
      method: "POST",
      headers: forged.headers,
      body: body.replace("STOP", "START"),
    });
    await expect(parseVerifiedTwilioForm(altered, config)).rejects.toMatchObject({ status: 401 });
    await expect(parseVerifiedTwilioForm(signedRequest({ AccountSid: `AC${"d".repeat(32)}` }), config)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects unexpected URLs, duplicate fields, and missing credentials", async () => {
    await expect(parseVerifiedTwilioForm(signedRequest({}, url, `${url}?unexpected=1`), config)).rejects.toMatchObject({ status: 400 });
    const duplicateBody = `${new URLSearchParams(params).toString()}&To=%2B12145550000`;
    const duplicate = new NextRequest(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": "bad" },
      body: duplicateBody,
    });
    await expect(parseVerifiedTwilioForm(duplicate, config)).rejects.toMatchObject({ status: 400 });
    await expect(parseVerifiedTwilioForm(signedRequest(), { ...config, authToken: "" })).rejects.toMatchObject({ status: 503 });
  });

  it("rejects an unknown destination instead of falling back to another tenant", async () => {
    await expect(resolveTwilioOrganization("+12145550999")).rejects.toMatchObject({ status: 404 });
  });
});
