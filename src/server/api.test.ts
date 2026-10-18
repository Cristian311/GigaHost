import { describe, expect, it, vi } from "vitest";

// auth-guard reaches next-auth, which cannot be imported under vitest. These
// paths are not what this file tests, so stand-in classes are enough.
vi.mock("@/server/auth-guard", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {},
}));

const { withApi } = await import("./api");

const ok = async () => new Response("done", { status: 200 });

function request(init: { method?: string; origin?: string; host?: string; forwarded?: string }) {
  const headers = new Headers();
  if (init.origin) headers.set("origin", init.origin);
  if (init.host) headers.set("host", init.host);
  if (init.forwarded) headers.set("x-forwarded-host", init.forwarded);
  return new Request("https://gigahost.ro/api/servers/x/power", {
    method: init.method ?? "POST",
    headers,
  });
}

describe("withApi origin check", () => {
  it("allows a same-origin write", async () => {
    const res = await withApi(request({ origin: "https://gigahost.ro" }), ok);
    expect(res.status).toBe(200);
  });

  it("allows a write with no Origin (the scheduler and Stripe)", async () => {
    const res = await withApi(request({}), ok);
    expect(res.status).toBe(200);
  });

  it("rejects a write from another site", async () => {
    const res = await withApi(request({ origin: "https://evil.example" }), ok);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "cross_origin" });
  });

  it("rejects a garbled Origin rather than guessing", async () => {
    const res = await withApi(request({ origin: "not-a-url" }), ok);
    expect(res.status).toBe(403);
  });

  it("trusts the proxy's forwarded host over the request URL", async () => {
    const res = await withApi(
      request({ origin: "https://panel.gigahost.ro", forwarded: "panel.gigahost.ro" }),
      ok,
    );
    expect(res.status).toBe(200);
  });

  it("does not block reads, which cannot be CSRF in the first place", async () => {
    const res = await withApi(request({ method: "GET", origin: "https://evil.example" }), ok);
    expect(res.status).toBe(200);
  });

  it("checks every unsafe method, not just POST", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await withApi(request({ method, origin: "https://evil.example" }), ok);
      expect(res.status, method).toBe(403);
    }
  });
});
