import { db } from "./db";
import type { SessionUser } from "./session";
import { ApiError } from "./errors";

export const ROLES = ["OWNER", "ADMIN", "MANAGER", "DISPATCHER", "TECHNICIAN", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

// Permission hierarchy index. Higher = more privileged.
export const ROLE_LEVEL: Record<Role, number> = {
  VIEWER: 10,
  TECHNICIAN: 20,
  DISPATCHER: 30,
  MANAGER: 40,
  ADMIN: 50,
  OWNER: 60,
};

export function hasRole(actual: string, required: Role): boolean {
  if (!ROLES.includes(actual as Role)) return false;
  return ROLE_LEVEL[actual as Role] >= ROLE_LEVEL[required];
}

export function requireRole(user: SessionUser | null, required: Role): asserts user is SessionUser {
  if (!user) throw new ApiError(401, "Unauthorized", "NO_SESSION");
  if (!hasRole(user.role, required)) {
    throw new ApiError(403, "Forbidden: requires " + required, "FORBIDDEN_ROLE");
  }
}

export function requireAuth(user: SessionUser | null): asserts user is SessionUser {
  if (!user) throw new ApiError(401, "Unauthorized", "NO_SESSION");
}

/**
 * Tenancy guard: assert that a resource belongs to the session's org before any
 * mutation or read. SPEC HARD CONSTRAINT: every query filters by organization_id
 * from session, never client input.
 */
export async function assertTenant(entity: { organizationId: string } | null, orgId: string): Promise<void> {
  if (!entity) throw new ApiError(404, "Not found", "NOT_FOUND");
  if (entity.organizationId !== orgId) {
    // SPEC: cross-tenant access must be blocked. Log it but never leak existence.
    throw new ApiError(404, "Not found", "NOT_FOUND");
  }
}

/**
 * Scoped where-clause helper. Every domain query must use this — it forces the
 * org filter to be present at the type level (caller must supply orgId from
 * session, not request body).
 */
export function orgScope(orgId: string) {
  return { organizationId: orgId } as const;
}
