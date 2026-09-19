import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createOrder } from "@/server/services/order-service";
import {
  createCoupon,
  createServerFor,
  createUser,
  endPeriod,
  resetData,
  setStatus,
} from "../setup/db";

// The route handlers read the session through these helpers. The module is
// replaced wholesale (rather than spied on) because the real one pulls in
// next-auth, which cannot load outside the Next.js runtime. Everything below
// the guard — services, Prisma, the provider — runs for real.
const auth = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/server/auth-guard", () => {
  class UnauthorizedError extends Error {
    constructor(message = "Unauthorized") {
      super(message);
      this.name = "UnauthorizedError";
    }
  }
  class ForbiddenError extends Error {
    constructor(message = "Forbidden") {
      super(message);
      this.name = "ForbiddenError";
    }
  }
  const currentUser = () => {
    if (!auth.userId) throw new UnauthorizedError();
    return { id: auth.userId, role: "USER" as const, locale: "en" };
  };
  return {
    UnauthorizedError,
    ForbiddenError,
    getOptionalUser: async () => (auth.userId ? currentUser() : null),
    getApiUser: async () => currentUser(),
    getApiAdmin: async () => {
      throw new ForbiddenError();
    },
    requireUser: async () => currentUser(),
    requireAdmin: async () => {
      throw new ForbiddenError();
    },
  };
});

const { POST: quoteRoute } = await import("@/app/api/pricing/quote/route");
const { GET: gamesRoute } = await import("@/app/api/games/route");
const { GET: listServersRoute, POST: createServerRoute } = await import(
  "@/app/api/servers/route"
);
const { GET: getServerRoute, DELETE: deleteServerRoute } = await import(
  "@/app/api/servers/[id]/route"
);
const { POST: powerRoute } = await import("@/app/api/servers/[id]/power/route");
const { POST: resizeRoute } = await import("@/app/api/servers/[id]/resize/route");
const { GET: eventsRoute } = await import("@/app/api/servers/[id]/events/route");
const { GET: listBackupsRoute, POST: createBackupRoute } = await import(
  "@/app/api/servers/[id]/backups/route"
);

const { POST: couponRoute } = await import("@/app/api/pricing/coupon/route");
const { GET: cronBillingGet, POST: cronBillingPost } = await import(
  "@/app/api/cron/billing/route"
);

const { POST: stripeWebhookRoute } = await import("@/app/api/webhooks/stripe/route");
const { GET: checkoutStateRoute } = await import("@/app/api/orders/[id]/checkout/route");

function post(body: unknown) {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("API route handlers", () => {
  beforeEach(async () => {
    await resetData();
    auth.userId = null;
  });

  it("returns a price quote and rejects an invalid body", async () => {
    const ok = await quoteRoute(
      post({
        gameSlug: "minecraft-java",
        ramGb: 8,
        vcpu: 4,
        storageGb: 50,
        regionCode: "eu-de",
        billingPeriod: "YEARLY",
      }),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ breakdown: { totalCents: 28917 } });

    const bad = await quoteRoute(post({ gameSlug: "minecraft-java", ramGb: 8 }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: "validation" });

    const malformed = await quoteRoute(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
    );
    expect(malformed.status).toBe(400);
  });

  it("serves the public games list", async () => {
    const res = await gamesRoute();
    expect(res.status).toBe(200);
    const games = (await res.json()) as Array<{
      slug: string;
      available: boolean;
      versions: string[];
    }>;
    expect(games.find((g) => g.slug === "roblox")?.available).toBe(false);
    expect(Array.isArray(games.find((g) => g.slug === "minecraft-java")?.versions)).toBe(true);
  });

  it("requires a session for server endpoints", async () => {
    const res = await listServersRoute();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthorized" });
  });

  it("creates, reads and deletes a server for the signed-in user", async () => {
    const user = await createUser();
    auth.userId = user.id;

    const created = await createServerRoute(
      post({
        name: "API server",
        gameSlug: "minecraft-java",
        ramGb: 8,
        vcpu: 4,
        storageGb: 50,
        regionCode: "eu-ro",
        billingPeriod: "MONTHLY",
      }),
    );
    expect(created.status).toBe(201);
    const { serverId } = (await created.json()) as { serverId: string };

    const list = await listServersRoute();
    expect((await list.json()) as unknown[]).toHaveLength(1);

    const detail = await getServerRoute(new Request("http://localhost"), ctx(serverId));
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ name: "API server", status: "INSTALLING" });

    const removed = await deleteServerRoute(new Request("http://localhost"), ctx(serverId));
    expect(removed.status).toBe(204);

    const gone = await getServerRoute(new Request("http://localhost"), ctx(serverId));
    expect(gone.status).toBe(404);
  });

  it("hides another user's server behind a 404", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const { serverId } = await createServerFor(owner.id);

    auth.userId = stranger.id;
    const res = await getServerRoute(new Request("http://localhost"), ctx(serverId));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "server_not_found" });

    const power = await powerRoute(post({ action: "start" }), ctx(serverId));
    expect(power.status).toBe(404);
  });

  it("rejects an invalid power action and an impossible transition", async () => {
    const user = await createUser();
    auth.userId = user.id;
    const { serverId } = await createServerFor(user.id);

    const invalid = await powerRoute(post({ action: "explode" }), ctx(serverId));
    expect(invalid.status).toBe(400);

    const tooEarly = await powerRoute(post({ action: "start" }), ctx(serverId));
    expect(tooEarly.status).toBe(409);
    expect(await tooEarly.json()).toMatchObject({ error: "invalid_transition" });
  });

  it("previews and applies a resize", async () => {
    const user = await createUser();
    auth.userId = user.id;
    const { serverId } = await createServerFor(user.id, { ramGb: 4, vcpu: 2, storageGb: 20 });
    await setStatus(serverId, "STOPPED");

    const preview = await resizeRoute(
      post({ ramGb: 8, vcpu: 2, storageGb: 20, dryRun: true }),
      ctx(serverId),
    );
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({ newMonthlyCents: expect.any(Number) });

    const applied = await resizeRoute(
      post({ ramGb: 8, vcpu: 2, storageGb: 20 }),
      ctx(serverId),
    );
    expect(applied.status).toBe(200);
    expect(await applied.json()).toMatchObject({ chargeCents: expect.any(Number) });

    const noop = await resizeRoute(post({ ramGb: 8, vcpu: 2, storageGb: 20 }), ctx(serverId));
    expect(noop.status).toBe(400);
    expect(await noop.json()).toMatchObject({ error: "no_change" });
  });

  it("creates and lists backups", async () => {
    const user = await createUser();
    auth.userId = user.id;
    const { serverId } = await createServerFor(user.id);
    await setStatus(serverId, "STOPPED");

    const created = await createBackupRoute(post({ name: "From API" }), ctx(serverId));
    expect(created.status).toBe(201);

    const list = await listBackupsRoute(new Request("http://localhost"), ctx(serverId));
    const backups = (await list.json()) as Array<{ name: string }>;
    expect(backups).toHaveLength(1);
    expect(backups[0].name).toBe("From API");
  });

  it("returns the activity log", async () => {
    const user = await createUser();
    auth.userId = user.id;
    const { serverId } = await createServerFor(user.id);

    const res = await eventsRoute(
      new Request("http://localhost/api?limit=10"),
      ctx(serverId),
    );
    expect(res.status).toBe(200);
    const events = (await res.json()) as Array<{ type: string }>;
    expect(events[0].type).toBe("CREATED");
  });
  describe("coupon preview", () => {
    const config = {
      gameSlug: "minecraft-java",
      ramGb: 8,
      vcpu: 4,
      storageGb: 50,
      regionCode: "eu-ro",
      billingPeriod: "MONTHLY",
    };

    it("prices a code for an anonymous visitor", async () => {
      await createCoupon({ code: "WELCOME20", value: 20 });

      const res = await couponRoute(post({ ...config, couponCode: "welcome20" }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        code: "WELCOME20",
        discountCents: 540,
        totalCents: 2160,
        currency: "EUR",
      });
    });

    it("tells a signed-in customer the code is already used", async () => {
      const user = await createUser();
      auth.userId = user.id;
      await createCoupon({ code: "ONCE" });
      await createServerFor(user.id, { couponCode: "ONCE" });

      const res = await couponRoute(post({ ...config, couponCode: "ONCE" }));

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "coupon_already_used" });
    });

    it("answers 404 for an unknown code and 400 for a missing one", async () => {
      const unknown = await couponRoute(post({ ...config, couponCode: "NOPE" }));
      expect(unknown.status).toBe(404);

      const missing = await couponRoute(post(config));
      expect(missing.status).toBe(400);
    });
  });

  describe("billing cron", () => {
    const call = (authorization?: string) =>
      new Request("http://localhost/api/cron/billing", {
        headers: authorization ? { authorization } : {},
      });

    // Start from a known state: a developer's .env may well define the secret.
    const original = process.env.CRON_SECRET;
    beforeEach(() => {
      delete process.env.CRON_SECRET;
    });
    afterEach(() => {
      if (original === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = original;
    });

    it("stays closed while no secret is configured", async () => {
      const res = await cronBillingGet(call("Bearer anything"));
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ error: "cron_disabled" });
    });

    it("rejects a missing or wrong secret", async () => {
      process.env.CRON_SECRET = "s3cret-value";

      expect((await cronBillingGet(call())).status).toBe(401);
      expect((await cronBillingGet(call("Bearer wrong"))).status).toBe(401);
      expect((await cronBillingGet(call("s3cret-value"))).status).toBe(401);
    });

    it("runs the billing cycle with the right secret", async () => {
      process.env.CRON_SECRET = "s3cret-value";
      const user = await createUser();
      const { serverId } = await createServerFor(user.id);
      await endPeriod(serverId);

      const res = await cronBillingPost(call("Bearer s3cret-value"));

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ renewed: 1, failed: 0, deleted: 0 });
    });
  });
  describe("Stripe webhook", () => {
    const SECRET = "whsec_test_secret";
    const signer = new Stripe("sk_test_dummy");

    function webhook(payload: string, signature?: string) {
      return new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: signature ? { "stripe-signature": signature } : {},
        body: payload,
      });
    }
    const sign = (payload: string, secret = SECRET) =>
      signer.webhooks.generateTestHeaderString({ payload, secret });

    function completedEvent(orderId: string) {
      return JSON.stringify({
        id: "evt_test_1",
        object: "event",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_1",
            object: "checkout.session",
            payment_status: "paid",
            client_reference_id: orderId,
            metadata: { orderId },
          },
        },
      });
    }

    beforeEach(() => {
      process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
      process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    });
    afterEach(() => {
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_WEBHOOK_SECRET;
    });

    it("stays closed while no signing secret is configured", async () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
      const res = await stripeWebhookRoute(webhook("{}", "t=1,v1=abc"));
      expect(res.status).toBe(503);
    });

    it("rejects unsigned, forged and tampered payloads", async () => {
      const user = await createUser();
      const order = await createOrder(user.id, {
        name: "Webhook Server",
        gameSlug: "minecraft-java",
        ramGb: 4,
        vcpu: 2,
        storageGb: 20,
        regionCode: "eu-ro",
        billingPeriod: "MONTHLY",
      });
      const payload = completedEvent(order.id);

      expect((await stripeWebhookRoute(webhook(payload))).status).toBe(400);
      expect((await stripeWebhookRoute(webhook(payload, sign(payload, "whsec_wrong")))).status).toBe(400);
      // Valid signature, but for a different body.
      const tampered = payload.replace(order.id, "someone-elses-order");
      expect((await stripeWebhookRoute(webhook(tampered, sign(payload)))).status).toBe(400);

      // None of that created a server.
      expect(await prisma.server.count({ where: { ownerId: user.id } })).toBe(0);
    });

    it("fulfils the order for a correctly signed event", async () => {
      const user = await createUser();
      auth.userId = user.id;
      const order = await createOrder(user.id, {
        name: "Webhook Server",
        gameSlug: "minecraft-java",
        ramGb: 4,
        vcpu: 2,
        storageGb: 20,
        regionCode: "eu-ro",
        billingPeriod: "MONTHLY",
      });
      const payload = completedEvent(order.id);

      const pending = await checkoutStateRoute(new Request("http://localhost"), ctx(order.id));
      expect(await pending.json()).toEqual({ status: "pending" });

      const res = await stripeWebhookRoute(webhook(payload, sign(payload)));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, outcome: "fulfilled" });

      const state = await checkoutStateRoute(new Request("http://localhost"), ctx(order.id));
      expect(await state.json()).toEqual({ status: "paid", serverId: expect.any(String) });
    });

    it("acknowledges an event for an unknown order so Stripe stops retrying", async () => {
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
      const payload = completedEvent("does-not-exist");

      const res = await stripeWebhookRoute(webhook(payload, sign(payload)));
      errorLog.mockRestore();

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ outcome: "rejected", reason: "order_not_found" });
    });
  });
});
