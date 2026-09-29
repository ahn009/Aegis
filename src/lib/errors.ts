export type ApiErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "NO_SESSION"
  | "FORBIDDEN"
  | "FORBIDDEN_ROLE"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "LOCKED_OUT"
  | "INTERNAL";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: ApiErrorCode = "INTERNAL",
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
  static badRequest(msg: string, details?: unknown) {
    return new ApiError(400, msg, "BAD_REQUEST", details);
  }
  static validation(msg: string, details?: unknown) {
    return new ApiError(422, msg, "VALIDATION", details);
  }
  static unauthorized(msg = "Unauthorized") {
    return new ApiError(401, msg, "UNAUTHORIZED");
  }
  static forbidden(msg = "Forbidden") {
    return new ApiError(403, msg, "FORBIDDEN");
  }
  static notFound(msg = "Not found") {
    return new ApiError(404, msg, "NOT_FOUND");
  }
  static conflict(msg: string, details?: unknown) {
    return new ApiError(409, msg, "CONFLICT", details);
  }
  static rateLimited(msg = "Too many requests") {
    return new ApiError(429, msg, "RATE_LIMITED");
  }
  static lockedOut(retryAfterSec: number) {
    const e = new ApiError(423, "Account temporarily locked", "LOCKED_OUT");
    (e as any).retryAfterSec = retryAfterSec;
    return e;
  }
}

export interface ApiOk<T> {
  ok: true;
  data: T;
}

export function ok<T>(data: T): ApiOk<T> {
  return { ok: true, data };
}

export function errorBody(err: unknown) {
  if (err instanceof ApiError) {
    const body = {
      ok: false,
      error: { code: err.code, message: err.message, details: err.details },
    };
    return { status: err.status, body };
  }
  console.error("[unhandled]", err);
  return {
    status: 500,
    body: { ok: false, error: { code: "INTERNAL", message: "Internal server error" } },
  };
}
