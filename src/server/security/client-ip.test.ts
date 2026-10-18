import { afterEach, describe, expect, it } from "vitest";
import { clientIp } from "./rate-limit";

const original = process.env.TRUSTED_PROXY_HOPS;

function headers(values: Record<string, string>) {
  return new Headers(values);
}

afterEach(() => {
  if (original === undefined) delete process.env.TRUSTED_PROXY_HOPS;
  else process.env.TRUSTED_PROXY_HOPS = original;
});

describe("clientIp", () => {
  describe("with no trusted proxy", () => {
    it("ignores X-Forwarded-For entirely", () => {
      delete process.env.TRUSTED_PROXY_HOPS;
      // Trusting this when nothing is in front of the app is the whole hole:
      // an attacker would get a fresh rate-limit bucket per password guess.
      expect(clientIp(headers({ "x-forwarded-for": "1.2.3.4" }))).toBe("unknown");
    });
  });

  describe("behind one proxy", () => {
    it("takes the entry that proxy added", () => {
      process.env.TRUSTED_PROXY_HOPS = "1";
      expect(clientIp(headers({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
    });

    it("ignores entries the client put there itself", () => {
      process.env.TRUSTED_PROXY_HOPS = "1";
      // The client claimed to be 9.9.9.9; the proxy appended what it saw.
      const spoofed = headers({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" });
      expect(clientIp(spoofed)).toBe("203.0.113.7");
    });

    it("cannot be rotated to get a new bucket", () => {
      process.env.TRUSTED_PROXY_HOPS = "1";
      const seen = new Set(
        ["a", "b", "c"].map((fake) =>
          clientIp(headers({ "x-forwarded-for": `${fake}, 203.0.113.7` })),
        ),
      );
      expect(seen).toEqual(new Set(["203.0.113.7"]));
    });
  });

  describe("behind two proxies", () => {
    it("counts in from the right", () => {
      process.env.TRUSTED_PROXY_HOPS = "2";
      const chain = headers({ "x-forwarded-for": "9.9.9.9, 203.0.113.7, 10.0.0.1" });
      expect(clientIp(chain)).toBe("203.0.113.7");
    });
  });

  it("falls back rather than returning an empty bucket key", () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    expect(clientIp(headers({}))).toBe("unknown");
    expect(clientIp(headers({ "x-forwarded-for": "" }))).toBe("unknown");
  });

  it("treats a nonsense setting as no proxy", () => {
    process.env.TRUSTED_PROXY_HOPS = "not-a-number";
    expect(clientIp(headers({ "x-forwarded-for": "1.2.3.4" }))).toBe("unknown");
  });

  it("uses X-Real-IP when no proxy chain is configured", () => {
    process.env.TRUSTED_PROXY_HOPS = "0";
    expect(clientIp(headers({ "x-real-ip": "198.51.100.5" }))).toBe("198.51.100.5");
  });
});
