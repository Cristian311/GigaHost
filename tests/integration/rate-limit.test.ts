import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  assertRateLimit,
  clearRateLimit,
  clientIp,
  consumeRateLimit,
  purgeExpiredRateLimits,
} from "@/server/security/rate-limit";
import { resetData } from "../setup/db";

const RULE = { limit: 3, windowMs: 60_000 };

describe("rate limiting", () => {
  beforeEach(resetData);

  it("allows up to the limit and then refuses", async () => {
    const results = [];
    for (let i = 0; i < 5; i += 1) results.push(await consumeRateLimit("k", RULE));

    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0, 0]);
    expect(results[3].retryAfterSeconds).toBeGreaterThan(0);
    expect(results[3].retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("starts over when the window has passed", async () => {
    const start = new Date();
    for (let i = 0; i < 4; i += 1) await consumeRateLimit("k", RULE, start);
    expect((await consumeRateLimit("k", RULE, start)).allowed).toBe(false);

    const later = new Date(start.getTime() + RULE.windowMs + 1);
    const result = await consumeRateLimit("k", RULE, later);
    expect(result).toMatchObject({ allowed: true, remaining: 2 });
  });

  it("counts keys independently", async () => {
    for (let i = 0; i < 4; i += 1) await consumeRateLimit("login:1.1.1.1:a@test.local", RULE);

    expect((await consumeRateLimit("login:1.1.1.1:a@test.local", RULE)).allowed).toBe(false);
    expect((await consumeRateLimit("login:1.1.1.1:b@test.local", RULE)).allowed).toBe(true);
    expect((await consumeRateLimit("login:2.2.2.2:a@test.local", RULE)).allowed).toBe(true);
  });

  it("holds under concurrent requests", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => consumeRateLimit("burst", RULE)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(RULE.limit);
    expect((await prisma.rateLimit.findUniqueOrThrow({ where: { key: "burst" } })).count).toBe(10);
  });

  it("throws a 429 that says when to retry", async () => {
    for (let i = 0; i < 3; i += 1) await assertRateLimit("k", RULE);

    await expect(assertRateLimit("k", RULE)).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
      details: { retryAfterSeconds: expect.any(Number) },
    });
  });

  it("can forget a counter, as a successful login does", async () => {
    for (let i = 0; i < 4; i += 1) await consumeRateLimit("k", RULE);
    await clearRateLimit("k");
    expect((await consumeRateLimit("k", RULE)).allowed).toBe(true);
  });

  it("purges expired counters only", async () => {
    const start = new Date();
    await consumeRateLimit("old", RULE, start);
    await consumeRateLimit("fresh", { limit: 3, windowMs: 3_600_000 }, start);

    const purged = await purgeExpiredRateLimits(new Date(start.getTime() + RULE.windowMs + 1));

    expect(purged).toBe(1);
    expect((await prisma.rateLimit.findMany()).map((r) => r.key)).toEqual(["fresh"]);
  });

  it("reads the client address from the trusted proxy hop", () => {
    // TRUSTED_PROXY_HOPS is 1 here (see vitest.config.mts), so the rightmost
    // entry is the one our own proxy added and everything left of it is
    // whatever the client claimed. Counting from the right is what stops an
    // attacker minting a fresh rate-limit bucket per request.
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" }))).toBe(
      "203.0.113.7",
    );
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
