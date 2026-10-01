import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db";
import { getClientIp } from "../src/lib/http";
import { consumeLoginAttempt, pruneExpiredLoginAttempts, recordSuccessfulLogin, type RateLimitResult } from "../src/lib/rate-limit";
import { POST as login } from "../src/app/api/auth/login/route";

describe("shared login abuse controls", () => {
  it("locks unknown and known identifiers with the same persistent attempt rule", async () => {
    const email = "unknown-person@example.test";
    for (let attempt = 1; attempt < 5; attempt++) {
      expect((await consumeLoginAttempt(email)).ok).toBe(true);
    }
    expect((await consumeLoginAttempt(email)).ok).toBe(false);
    expect((await consumeLoginAttempt("UNKNOWN-PERSON@example.test")).ok).toBe(false);
    expect((await db.loginCounter.findMany()).some((counter) => counter.count === 5)).toBe(true);
    await recordSuccessfulLogin(email);
    expect((await consumeLoginAttempt(email)).ok).toBe(true);
  });

  it("limits account spraying from a configured trusted proxy IP", async () => {
    const ip = "198.51.100.42";
    for (let attempt = 1; attempt <= 30; attempt++) {
      await consumeLoginAttempt(`spray-${attempt}@example.test`, ip);
    }
    expect((await consumeLoginAttempt("new-account@example.test", ip)).ok).toBe(false);
    expect((await consumeLoginAttempt("new-account@example.test", "198.51.100.43")).ok).toBe(true);
  });

  it("prunes expired attempts so storage and lockouts do not grow forever", async () => {
    await consumeLoginAttempt("old-attempt@example.test");
    await db.loginCounter.updateMany({ data: { windowStartedAt: new Date(Date.now() - 20 * 60 * 1000) } });
    expect(await pruneExpiredLoginAttempts()).toBeGreaterThan(0);
    expect((await consumeLoginAttempt("old-attempt@example.test")).ok).toBe(true);
  });

  it("reserves attempts before verification and denies the fifth attempt", async () => {
    const email = "reservation@example.test";
    const results: RateLimitResult[] = [];
    for (let attempt = 0; attempt < 5; attempt++) results.push(await consumeLoginAttempt(email));
    expect(results.map((result) => result.ok)).toEqual([true, true, true, true, false]);
    expect((await consumeLoginAttempt(email)).ok).toBe(false);
    expect((await db.loginCounter.findMany()).map((counter) => counter.count)).toContain(5);
  });

  it("does not admit more than four simultaneous attempts for one account", async () => {
    const email = "concurrent-reservation@example.test";
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => consumeLoginAttempt(email)));
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(results.filter((result) => result.status === "fulfilled" && result.value.ok)).toHaveLength(4);
  });

  it("applies the shared limit to the public login route for unknown accounts", async () => {
    const attempt = () => login(new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ email: "route-unknown@example.test", password: "wrong-password" }),
    }), { params: Promise.resolve({}) });
    for (let index = 0; index < 4; index++) expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(423);
    expect((await attempt()).status).toBe(423);
  });
});

describe("trusted client address", () => {
  const original = process.env.VELORA_TRUSTED_PROXY;
  afterEach(() => {
    if (original === undefined) delete process.env.VELORA_TRUSTED_PROXY;
    else process.env.VELORA_TRUSTED_PROXY = original;
  });

  it("ignores forwarded headers until the deployment opts into a trusted proxy", () => {
    delete process.env.VELORA_TRUSTED_PROXY;
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      headers: { "x-forwarded-for": "198.51.100.42", "x-real-ip": "203.0.113.2" },
    });
    expect(getClientIp(req)).toBeUndefined();
  });

  it("uses the first valid Render-forwarded address only when configured", () => {
    process.env.VELORA_TRUSTED_PROXY = "render";
    const valid = new NextRequest("http://localhost:3000/api/auth/login", {
      headers: { "x-forwarded-for": "198.51.100.42, 10.0.0.1" },
    });
    const invalid = new NextRequest("http://localhost:3000/api/auth/login", {
      headers: { "x-forwarded-for": "not-an-ip" },
    });
    expect(getClientIp(valid)).toBe("198.51.100.42");
    expect(getClientIp(invalid)).toBeUndefined();
  });
});
