import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db";
import { getClientIp } from "../src/lib/http";
import { checkLockout, pruneExpiredLoginAttempts, recordFailedLogin, recordSuccessfulLogin } from "../src/lib/rate-limit";

describe("shared login abuse controls", () => {
  it("locks unknown and known identifiers with the same persistent attempt rule", async () => {
    const email = "unknown-person@example.test";
    for (let attempt = 1; attempt < 5; attempt++) {
      expect((await recordFailedLogin(email)).ok).toBe(true);
    }
    expect((await recordFailedLogin(email)).ok).toBe(false);
    expect((await checkLockout("UNKNOWN-PERSON@example.test")).ok).toBe(false);
    expect(await db.loginAttempt.count()).toBe(5);
    await recordSuccessfulLogin(email);
    expect((await checkLockout(email)).ok).toBe(true);
  });

  it("limits account spraying from a configured trusted proxy IP", async () => {
    const ip = "198.51.100.42";
    for (let attempt = 1; attempt <= 30; attempt++) {
      await recordFailedLogin(`spray-${attempt}@example.test`, ip);
    }
    expect((await checkLockout("new-account@example.test", ip)).ok).toBe(false);
    expect((await checkLockout("new-account@example.test", "198.51.100.43")).ok).toBe(true);
  });

  it("prunes expired attempts so storage and lockouts do not grow forever", async () => {
    await recordFailedLogin("old-attempt@example.test");
    await db.loginAttempt.updateMany({ data: { createdAt: new Date(Date.now() - 20 * 60 * 1000) } });
    expect(await pruneExpiredLoginAttempts()).toBeGreaterThan(0);
    expect((await checkLockout("old-attempt@example.test")).ok).toBe(true);
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
