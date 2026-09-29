import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "./session";
import { errorBody, ok } from "./errors";
import { requireAuth, requireRole, type Role } from "./auth-context";

type HandlerCtx = {
  params: Record<string, string | string[]>;
  user: SessionUser;
  req: NextRequest;
};

type AuthedHandler = (ctx: HandlerCtx) => Promise<Response> | Response;

/**
 * Wraps an API handler with: session resolution, error → JSON mapping, and
 * (optional) RBAC. Every authenticated route MUST go through this so tenancy
 * context (user.organizationId) is always present.
 */
export function withApi(handler: AuthedHandler, opts?: { role?: Role }) {
  return async (
    req: NextRequest,
    ctx: { params: Promise<Record<string, string | string[]>> },
  ): Promise<Response> => {
    try {
      const params = await ctx.params;
      const user = await getSessionUser();
      if (opts?.role) requireRole(user, opts.role);
      else requireAuth(user);
      const result = await handler({ params, user: user!, req });
      return result;
    } catch (err) {
      const { status, body } = errorBody(err);
      return NextResponse.json(body, { status });
    }
  };
}

/** Public route wrapper (no auth) with error handling only. */
export function withPublicApi(handler: (req: NextRequest, ctx: { params: Promise<Record<string, string | string[]>> }) => Promise<Response> | Response) {
  return async (
    req: NextRequest,
    ctx: { params: Promise<Record<string, string | string[]>> },
  ): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      const { status, body } = errorBody(err);
      return NextResponse.json(body, { status });
    }
  };
}

export { ok };
