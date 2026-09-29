import { NextRequest, NextResponse } from "next/server";
import { ZodType, ZodError } from "zod";
import { ApiError } from "./errors";

// Re-export the route wrappers so API routes can import everything from "@/lib/http".
export { withApi, withPublicApi, ok } from "./with-api";

export type ApiHandler<T> = (req: NextRequest, ctx: { params: Promise<Record<string, string | string[]>> }) => Promise<NextResponse> | NextResponse;

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
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}
