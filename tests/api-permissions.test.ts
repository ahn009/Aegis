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
import { GET as callDetail } from "../src/app/api/calls/[id]/route";
import { GET as leadDetail } from "../src/app/api/leads/[id]/route";
import { GET as appointmentDetail } from "../src/app/api/appointments/[id]/detail/route";
import { PATCH as updateLead } from "../src/app/api/leads/[id]/status/route";
import { POST as publishRule } from "../src/app/api/rules/[id]/publish/route";

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

describe("staff route permission and tenant matrix", () => {
  beforeEach(() => getSessionUser.mockReset());

  it("returns 404 for another tenant's call, lead, and appointment details", async () => {
    const first = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    const second = await db.organization.create({ data: { name: "Detail tenant", slug: `detail-${randomUUID()}` } });
    const call = await db.call.create({ data: { organizationId: second.id, callSid: randomUUID(), fromPhone: "+12145550101", toPhone: "+12145550102" } });
    const lead = await db.lead.create({ data: { organizationId: second.id, name: "Private lead", phoneE164: "+12145550103" } });
    const appointment = await db.appointment.create({ data: { organizationId: second.id, serviceType: "REPAIR", startTime: new Date("2026-11-01T12:00:00Z"), endTime: new Date("2026-11-01T13:00:00Z") } });
    const routes = [
      [callDetail, `/api/calls/${call.id}`, call.id],
      [leadDetail, `/api/leads/${lead.id}`, lead.id],
      [appointmentDetail, `/api/appointments/${appointment.id}/detail`, appointment.id],
    ] as const;

    getSessionUser.mockResolvedValue({ ...user, organizationId: first.id, role: "VIEWER" });
    for (const [handler, path, id] of routes) {
      expect((await handler(new NextRequest(`http://localhost:3000${path}`), { params: Promise.resolve({ id }) })).status).toBe(404);
    }
    getSessionUser.mockResolvedValue({ ...user, organizationId: second.id, role: "VIEWER" });
    for (const [handler, path, id] of routes) {
      expect((await handler(new NextRequest(`http://localhost:3000${path}`), { params: Promise.resolve({ id }) })).status).toBe(200);
    }
  });

  it("blocks lower roles and cross-tenant lead status writes", async () => {
    const first = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    const second = await db.organization.create({ data: { name: "Lead tenant", slug: `lead-${randomUUID()}` } });
    const lead = await db.lead.create({ data: { organizationId: second.id, name: "Private lead", phoneE164: "+12145550104" } });
    const path = `/api/leads/${lead.id}/status`;
    const ctx = { params: Promise.resolve({ id: lead.id }) };
    const patch = () => updateLead(new NextRequest(`http://localhost:3000${path}`, { method: "PATCH", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ status: "CONTACTED" }) }), ctx);

    for (const role of ["VIEWER", "TECHNICIAN"]) {
      getSessionUser.mockResolvedValue({ ...user, organizationId: second.id, role });
      expect((await patch()).status).toBe(403);
    }
    getSessionUser.mockResolvedValue({ ...user, organizationId: first.id, role: "DISPATCHER" });
    expect((await patch()).status).toBe(404);
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("NEW");
    getSessionUser.mockResolvedValue({ ...user, organizationId: second.id, role: "DISPATCHER" });
    expect((await patch()).status).toBe(200);
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("CONTACTED");
  });

  it("blocks lower roles and cross-tenant rule publishing", async () => {
    const first = await db.organization.findUniqueOrThrow({ where: { slug: "dfw-velora-hvac" } });
    const second = await db.organization.create({ data: { name: "Rule tenant", slug: `rule-${randomUUID()}` } });
    const draft = await db.businessRuleVersion.create({ data: { organizationId: second.id, ruleType: "holidays", version: 1, dataJson: "{}" } });
    const path = `/api/rules/${draft.id}/publish`;
    const ctx = { params: Promise.resolve({ id: draft.id }) };
    const post = () => publishRule(request(path), ctx);

    getSessionUser.mockResolvedValue({ ...user, organizationId: second.id, role: "DISPATCHER" });
    expect((await post()).status).toBe(403);
    getSessionUser.mockResolvedValue({ ...user, organizationId: first.id, role: "MANAGER" });
    expect((await post()).status).toBe(404);
    expect((await db.businessRuleVersion.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("DRAFT");
    getSessionUser.mockResolvedValue({ ...user, organizationId: second.id, role: "MANAGER" });
    expect((await post()).status).toBe(200);
    expect((await db.businessRuleVersion.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("PUBLISHED");
  });
});
