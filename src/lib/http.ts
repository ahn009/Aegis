import { NextRequest, NextResponse } from "next/server";
import { ZodType, ZodError } from "zod";
import { ApiError } from "./errors";
import { isIP } from "node:net";

// Re-export the route wrappers so API routes can import everything from "@/lib/http".
export { withApi, withPublicApi, ok } from "./with-api";

export type ApiHandler = (req: NextRequest, ctx: { params: Promise<Record<string, string | string[]>> }) => Promise<Response> | Response;

export function json(body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, init);
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw ApiError.badRequest("Invalid JSON body");
  }
  try {
    return schema.parse(raw) as T;
  } catch (e) {
    if (e instanceof ZodError) {
      throw ApiError.validation("Validation failed", e.issues.map((i) => ({ path: i.path, message: i.message })));
    }
    throw e;
  }
}

export async function parseQuery<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  const obj: Record<string, string | string[]> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    const existing = obj[key];
    if (Array.isArray(existing)) existing.push(value);
    else if (existing !== undefined) obj[key] = [existing, value];
    else obj[key] = value;
  });
  try {
    return schema.parse(obj) as T;
  } catch (e) {
    if (e instanceof ZodError) {
      throw ApiError.validation("Query validation failed", e.issues.map((i) => ({ path: i.path, message: i.message })));
    }
    throw e;
  }
}

export function getClientIp(req: NextRequest): string | undefined {
  // Render's public edge overwrites CF-Connecting-IP. X-Forwarded-For can
  // contain a caller-supplied leftmost value, so it is not an admission key.
  // Confirm the header behavior on the selected staging deployment.
  if (process.env.VELORA_TRUSTED_PROXY !== "render") return undefined;
  const candidate = req.headers.get("cf-connecting-ip")?.trim();
  if (!candidate || !isIP(candidate)) {
    throw new ApiError(503, "Trusted client address unavailable", "SERVICE_UNAVAILABLE");
  }
  return candidate;
}
