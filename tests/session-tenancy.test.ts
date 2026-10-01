import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";
import {
  createSession,
  getSessionUserForToken,
  switchSessionOrganizationForToken,
} from "../src/lib/session";

describe("session organization binding", () => {
  it("keeps the selected organization and current membership role across reads and switches", async () => {
    const suffix = randomUUID();
    const user = await db.user.create({
      data: { email: `multi-${suffix}@example.test`, passwordHash: hashPassword("test-password") },
    });
    const first = await db.organization.create({ data: { name: "First", slug: `first-${suffix}` } });
    const second = await db.organization.create({ data: { name: "Second", slug: `second-${suffix}` } });
    const outsider = await db.organization.create({ data: { name: "Outsider", slug: `outsider-${suffix}` } });
    await db.membership.createMany({ data: [
      { userId: user.id, organizationId: first.id, role: "VIEWER" },
      { userId: user.id, organizationId: second.id, role: "ADMIN" },
    ] });

    const { token, session } = await createSession(user.id, second.id, {});
    expect(session.activeOrganizationId).toBe(second.id);
    expect(await getSessionUserForToken(token)).toMatchObject({ organizationId: second.id, role: "ADMIN" });

    await db.membership.update({
      where: { organizationId_userId: { organizationId: second.id, userId: user.id } },
      data: { role: "DISPATCHER" },
    });
    expect(await getSessionUserForToken(token)).toMatchObject({ organizationId: second.id, role: "DISPATCHER" });

    await expect(switchSessionOrganizationForToken(token, outsider.id)).rejects.toMatchObject({ status: 404 });
    expect(await getSessionUserForToken(token)).toMatchObject({ organizationId: second.id });

    const switched = await switchSessionOrganizationForToken(token, first.id);
    expect(switched).toMatchObject({ organizationId: first.id, role: "VIEWER" });
    expect(switched.token).not.toBe(token);
    expect(await getSessionUserForToken(token)).toBeNull();
    expect(await getSessionUserForToken(switched.token)).toMatchObject({ organizationId: first.id, role: "VIEWER" });

    await db.membership.delete({
      where: { organizationId_userId: { organizationId: first.id, userId: user.id } },
    });
    expect(await getSessionUserForToken(switched.token)).toBeNull();
    await expect(switchSessionOrganizationForToken(switched.token, second.id)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects legacy sessions without an active organization", async () => {
    const suffix = randomUUID();
    const user = await db.user.create({
      data: { email: `legacy-${suffix}@example.test`, passwordHash: hashPassword("test-password") },
    });
    const org = await db.organization.create({ data: { name: "Legacy", slug: `legacy-${suffix}` } });
    await db.membership.create({ data: { userId: user.id, organizationId: org.id, role: "OWNER" } });
    const { token, session } = await createSession(user.id, org.id, {});
    await db.session.update({ where: { id: session.id }, data: { activeOrganizationId: null } });
    expect(await getSessionUserForToken(token)).toBeNull();
    await expect(createSession(user.id, "unknown-org", {})).rejects.toMatchObject({ status: 403 });
  });

  it.each(["idleExpiresAt", "absoluteExpiresAt"])("rejects and deletes sessions past %s", async (field) => {
    const suffix = randomUUID();
    const user = await db.user.create({ data: { email: `expired-${suffix}@example.test`, passwordHash: hashPassword("test-password") } });
    const org = await db.organization.create({ data: { name: "Expiry", slug: `expiry-${suffix}` } });
    await db.membership.create({ data: { userId: user.id, organizationId: org.id, role: "VIEWER" } });
    const { token, session } = await createSession(user.id, org.id, {});
    await db.session.update({ where: { id: session.id }, data: { [field]: new Date(Date.now() - 1000) } });
    expect(await getSessionUserForToken(token)).toBeNull();
    expect(await db.session.findUnique({ where: { id: session.id } })).toBeNull();
  });
});
