import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db";

const getSessionUser = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/session", () => ({ getSessionUser }));

import { POST as confirm } from "../src/app/api/appointments/[id]/confirm/route";
import { POST as cancel } from "../src/app/api/appointments/[id]/cancel/route";
import { GET as audit } from "../src/app/api/audit/route";
import { GET as workerStatus } from "../src/app/api/worker/status/route";

const context = { params: Promise.resolve({ id: "missing-appointment" }) };
const user = { userId: "test-user", organizationId: "test-organization", email: "user@example.test", name: null };

function request(path: string, origin = "http://localhost:3000", body?: unknown) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("appointment mutation boundary", () => {
  beforeEach(() => getSessionUser.mockReset());

  it.each(["VIEWER", "TECHNICIAN"])("denies %s confirmation and cancellation", async (role) => {
    getSessionUser.mockResolvedValue({ ...user, role });
    const confirmResponse = await confirm(request("/api/appointments/missing-appointment/confirm"), context);
    const cancelResponse = await cancel(request("/api/appointments/missing-appointment/cancel", undefined, { reason: "test" }), context);
    expect(confirmResponse.status).toBe(403);
    expect(cancelResponse.status).toBe(403);
  });

  it("lets a dispatcher past the role gate, then scopes the appointment lookup", async () => {
    getSessionUser.mockResolvedValue({ ...user, role: "DISPATCHER" });
    const response = await confirm(request("/api/appointments/missing-appointment/confirm"), context);
    expect(response.status).toBe(404);
  });

  it("rejects a cross-site mutation before resolving the session", async () => {
    const response = await confirm(request("/api/appointments/missing-appointment/confirm", "https://evil.example.test"), context);
    expect(response.status).toBe(403);
    expect(getSessionUser).not.toHaveBeenCalled();
  });
});

describe("sensitive read boundary", () => {
  beforeEach(() => getSessionUser.mockReset());

  it("denies the full audit log to a viewer", async () => {
    getSessionUser.mockResolvedValue({ ...user, role: "VIEWER" });
    const response = await audit(new NextRequest("http://localhost:3000/api/audit"), context);
    expect(response.status).toBe(403);
  });

  it("hides worker error text from a viewer while preserving queue counts", async () => {
    const org = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    await db.outboxEvent.create({
      data: { organizationId: org.id, eventType: "TEST", payloadJson: "{}", status: "DEAD", lastError: "private provider detail" },
    });
    getSessionUser.mockResolvedValue({ ...user, organizationId: org.id, role: "VIEWER" });
    const request = new NextRequest("http://localhost:3000/api/worker/status");
    const viewerResponse = await workerStatus(request, context);
    expect(viewerResponse.status).toBe(200);
    const viewerBody = await viewerResponse.json();
    expect(viewerBody.data.queue.dead).toBeGreaterThan(0);
    expect(viewerBody.data.lastError.message).toBeNull();

    getSessionUser.mockResolvedValue({ ...user, organizationId: org.id, role: "ADMIN" });
    const adminResponse = await workerStatus(new NextRequest("http://localhost:3000/api/worker/status"), context);
    expect((await adminResponse.json()).data.lastError.message).toBe("private provider detail");
  });
});
