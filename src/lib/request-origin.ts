import { ApiError } from "./errors";
import { env } from "./env";

/** Cookie-authenticated mutations are only accepted from the configured app origin. */
export function assertSameOrigin(method: string, origin: string | null, appBaseUrl = env.appBaseUrl): void {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return;
  const expected = new URL(appBaseUrl).origin;
  if (!origin || origin === "null") throw ApiError.forbidden("Request origin required");
  try {
    const received = new URL(origin);
    if (received.origin !== expected || received.href !== `${received.origin}/`) throw new Error("Invalid origin");
  } catch {
    throw ApiError.forbidden("Request origin does not match application");
  }
}
