import type { NextRequest } from "next/server";
import { validateRequest } from "twilio";
import { db } from "./db";
import { env } from "./env";
import { ApiError } from "./errors";
import { normalizePhone } from "./phone";

type TwilioConfig = { accountSid: string; authToken: string; appBaseUrl: string };

/** Validate every form field and the exact public webhook URL with Twilio's SDK. */
export async function parseVerifiedTwilioForm(
  req: NextRequest,
  config: TwilioConfig = {
    accountSid: env.twilioAccountSid,
    authToken: env.twilioAuthToken,
    appBaseUrl: env.appBaseUrl,
  },
): Promise<Record<string, string>> {
  if (!config.accountSid || !config.authToken) {
    throw new ApiError(503, "Twilio credentials unavailable", "SERVICE_UNAVAILABLE");
  }
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    throw ApiError.badRequest("Expected form-encoded webhook");
  }
  // Callbacks are configured without query parameters. This keeps the public
  // URL used for signature validation exact and predictable.
  if (req.nextUrl.search) throw ApiError.badRequest("Webhook query parameters are not configured");
  const raw = await req.text();
  if (raw.length > 64_000) throw ApiError.badRequest("Webhook body too large");
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(raw)) {
    if (Object.hasOwn(params, key)) throw ApiError.badRequest("Duplicate webhook parameter");
    params[key] = value;
  }
  const signature = req.headers.get("x-twilio-signature");
  const publicUrl = `${new URL(config.appBaseUrl).origin}${req.nextUrl.pathname}`;
  if (!signature || !validateRequest(config.authToken, signature, publicUrl, params)) {
    throw ApiError.unauthorized("Invalid webhook signature");
  }
  if (params.AccountSid !== config.accountSid) throw ApiError.unauthorized("Wrong provider account");
  return params;
}

/** The signed destination number, never a client-provided org ID, selects the tenant. */
export async function resolveTwilioOrganization(to: string | undefined): Promise<string> {
  const phoneE164 = normalizePhone(to);
  if (!phoneE164) throw ApiError.badRequest("Invalid destination number");
  const number = await db.inboundNumber.findUnique({ where: { phoneE164 } });
  if (!number || number.provider !== "twilio") throw ApiError.notFound("Destination number not configured");
  return number.organizationId;
}
