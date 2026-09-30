import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";

const getSessionUser = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/session", () => ({ getSessionUser }));

import { POST as confirm } from "../src/app/api/appointments/[id]/confirm/route";
import { POST as cancel } from "../src/app/api/appointments/[id]/cancel/route";
import { GET as audit } from "../src/app/api/audit/route";
import { GET as workerStatus } from "../src/app/api/worker/status/route";
import { POST as runWorker } from "../src/app/api/worker/run/route";
import { GET as contactDetail } from "../src/app/api/contacts/[id]/route";
import { GET as contactList } from "../src/app/api/contacts/route";

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

describe("manual worker tenant boundary", () => {
  beforeEach(() => getSessionUser.mockReset());

  it("requires an administrator and processes only their organization's jobs", async () => {
    const first = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    const second = await db.organization.create({ data: { name: "Second worker tenant", slug: `worker-${randomUUID()}` } });
    const [ownEvent, otherEvent] = await Promise.all([
      db.outboxEvent.create({ data: { organizationId: first.id, eventType: "HOLD_EXPIRE", payloadJson: JSON.stringify({ appointmentId: "missing" }) } }),
      db.outboxEvent.create({ data: { organizationId: second.id, eventType: "HOLD_EXPIRE", payloadJson: JSON.stringify({ appointmentId: "missing" }) } }),
    ]);

    getSessionUser.mockResolvedValue({ ...user, organizationId: first.id, role: "MANAGER" });
    expect((await runWorker(request("/api/worker/run"), context)).status).toBe(403);

    getSessionUser.mockResolvedValue({ ...user, organizationId: first.id, role: "ADMIN" });
    const response = await runWorker(request("/api/worker/run"), context);
    expect(response.status).toBe(200);
    expect((await response.json()).data.processed).toBe(1);
    expect((await db.outboxEvent.findUniqueOrThrow({ where: { id: ownEvent.id } })).status).toBe("DONE");
    expect((await db.outboxEvent.findUniqueOrThrow({ where: { id: otherEvent.id } })).status).toBe("PENDING");
  });
});

describe("contact read tenant boundary", () => {
  beforeEach(() => getSessionUser.mockReset());

  it("hides another organization's contact from both detail and list routes", async () => {
    const first = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    const second = await db.organization.create({ data: { name: "Second contact tenant", slug: `contacts-${randomUUID()}` } });
    const contact = await db.contact.create({ data: { organizationId: second.id, phoneE164: "+12145550998", name: "Other tenant private contact" } });
    const detailContext = { params: Promise.resolve({ id: contact.id }) };

    getSessionUser.mockResolvedValue({ ...user, organizationId: first.id, role: "VIEWER" });
    expect((await contactDetail(new NextRequest(`http://localhost:3000/api/contacts/${contact.id}`), detailContext)).status).toBe(404);
    const firstList = await contactList(new NextRequest("http://localhost:3000/api/contacts"), context);
    expect(firstList.status).toBe(200);
    expect((await firstList.json()).data.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: contact.id })]));

    getSessionUser.mockResolvedValue({ ...user, organizationId: second.id, role: "VIEWER" });
    const secondDetail = await contactDetail(new NextRequest(`http://localhost:3000/api/contacts/${contact.id}`), detailContext);
    expect(secondDetail.status).toBe(200);
    expect((await secondDetail.json()).data.contact.id).toBe(contact.id);
  });
});
