import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { setPaymentProviderForTests } from "@/server/payments";
import {
  StripePaymentProvider,
  type StripeLike,
} from "@/server/payments/stripe-payment-provider";
import { checkout } from "@/server/services/order-service";
import { getCheckoutState, handleStripeEvent } from "@/server/services/payment-service";
import { runBillingCycle } from "@/server/services/renewal-service";
import { resizeServer } from "@/server/services/resize-service";
import { createServerFor, createUser, endPeriod, resetData, setStatus } from "../setup/db";

const INPUT = {
  name: "Stripe Server",
  gameSlug: "minecraft-java",
  ramGb: 4,
  vcpu: 2,
  storageGb: 20,
  regionCode: "eu-ro",
  billingPeriod: "MONTHLY" as const,
};
const URLS = {
  successUrl: "https://gigahost.test/en/dashboard/checkout/success",
  cancelUrl: "https://gigahost.test/en/configure",
};

// Shared across fakes so ids stay unique, as they are at Stripe.
let counter = 0;

/** In-memory stand-in for the parts of the Stripe SDK the provider calls. */
function fakeStripe() {
  const sessions = new Map<string, { id: string; payment_status: string }>();
  const stripe = {
    customers: {
      create: vi.fn(async () => ({ id: `cus_${(counter += 1)}` })),
    },
    checkout: {
      sessions: {
        create: vi.fn(async () => {
          const session = {
            id: `cs_test_${(counter += 1)}`,
            url: "https://checkout.stripe.test/pay",
            payment_status: "unpaid",
          };
          sessions.set(session.id, session);
          return session;
        }),
        retrieve: vi.fn(async (id: string) => sessions.get(id)),
      },
    },
    paymentMethods: {
      list: vi.fn(async () => ({ data: [{ id: "pm_card_visa" }] })),
    },
    paymentIntents: {
      create: vi.fn(async () => ({ id: `pi_${(counter += 1)}`, status: "succeeded" })),
    },
    billingPortal: {
      sessions: { create: vi.fn(async () => ({ url: "https://billing.stripe.test/portal" })) },
    },
  };
  const markPaid = (id: string) => {
    sessions.get(id)!.payment_status = "paid";
  };
  return { stripe, client: stripe as unknown as StripeLike, markPaid };
}

function sessionEvent(
  type: string,
  orderId: string | null,
  paymentStatus = "paid",
): Stripe.Event {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type,
    data: {
      object: {
        id: "cs_test_event",
        object: "checkout.session",
        payment_status: paymentStatus,
        client_reference_id: orderId,
        metadata: orderId ? { orderId } : {},
      },
    },
  } as unknown as Stripe.Event;
}

const charge = (overrides: Partial<Parameters<StripePaymentProvider["chargeSaved"]>[0]> = {}) => ({
  orderId: "order_1",
  idempotencyKey: "order_1:1",
  userId: "",
  amountCents: 1400,
  currency: "EUR",
  description: "renewal",
  ...overrides,
});

describe("Stripe", () => {
  beforeEach(resetData);
  afterEach(() => setPaymentProviderForTests(undefined));

  describe("provider", () => {
    it("opens a hosted checkout that also saves the card", async () => {
      const user = await createUser();
      const { stripe, client } = fakeStripe();
      const provider = new StripePaymentProvider(client);

      const result = await provider.startCheckout({
        orderId: "order_1",
        userId: user.id,
        userEmail: user.email,
        amountCents: 1400,
        currency: "EUR",
        description: "My server",
        ...URLS,
      });

      expect(result).toEqual({
        kind: "redirect",
        url: "https://checkout.stripe.test/pay",
        reference: expect.stringMatching(/^cs_test_/),
      });

      const [params, options] = stripe.checkout.sessions.create.mock.calls[0] as unknown as [
        Stripe.Checkout.SessionCreateParams,
        Stripe.RequestOptions,
      ];
      expect(params).toMatchObject({
        mode: "payment",
        client_reference_id: "order_1",
        metadata: { orderId: "order_1" },
        payment_intent_data: { setup_future_usage: "off_session" },
        success_url: URLS.successUrl,
        cancel_url: URLS.cancelUrl,
      });
      expect(params.line_items?.[0].price_data).toMatchObject({
        currency: "eur",
        unit_amount: 1400,
      });
      // A double click must not open two sessions for one order.
      expect(options.idempotencyKey).toBe("checkout:order_1");
    });

    it("creates the Stripe customer once and remembers it", async () => {
      const user = await createUser();
      const { stripe, client } = fakeStripe();
      const provider = new StripePaymentProvider(client);

      const first = await provider.ensureCustomer(user.id, user.email);
      const second = await provider.ensureCustomer(user.id, user.email);

      expect(second).toBe(first);
      expect(stripe.customers.create).toHaveBeenCalledOnce();
      const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(saved.stripeCustomerId).toBe(first);
    });

    it("charges the saved card off-session", async () => {
      const user = await createUser();
      const { stripe, client } = fakeStripe();
      const provider = new StripePaymentProvider(client);
      await provider.ensureCustomer(user.id, user.email);

      const result = await provider.chargeSaved(charge({ userId: user.id }));

      expect(result).toEqual({ status: "succeeded", reference: expect.stringMatching(/^pi_/) });
      const [params, options] = stripe.paymentIntents.create.mock.calls[0] as unknown as [
        Stripe.PaymentIntentCreateParams,
        Stripe.RequestOptions,
      ];
      expect(params).toMatchObject({
        amount: 1400,
        currency: "eur",
        payment_method: "pm_card_visa",
        off_session: true,
        confirm: true,
        metadata: { orderId: "order_1" },
      });
      expect(options.idempotencyKey).toBe("order_1:1");
    });

    it("fails cleanly when the customer has no saved card", async () => {
      const user = await createUser();
      const { stripe, client } = fakeStripe();
      const provider = new StripePaymentProvider(client);

      // Never checked out: no Stripe customer at all.
      expect(await provider.chargeSaved(charge({ userId: user.id }))).toEqual({
        status: "failed",
        reason: "no_payment_method",
      });

      // A customer whose card was removed.
      await provider.ensureCustomer(user.id, user.email);
      stripe.paymentMethods.list.mockResolvedValueOnce({ data: [] });
      expect(await provider.chargeSaved(charge({ userId: user.id }))).toEqual({
        status: "failed",
        reason: "no_payment_method",
      });
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it("reports a declined card with Stripe's decline code", async () => {
      const user = await createUser();
      const { stripe, client } = fakeStripe();
      const provider = new StripePaymentProvider(client);
      await provider.ensureCustomer(user.id, user.email);
      stripe.paymentIntents.create.mockRejectedValueOnce(
        new Stripe.errors.StripeCardError({
          type: "card_error",
          message: "Your card has insufficient funds.",
          code: "card_declined",
          decline_code: "insufficient_funds",
        }),
      );

      expect(await provider.chargeSaved(charge({ userId: user.id }))).toEqual({
        status: "failed",
        reason: "insufficient_funds",
      });
    });

    it("treats a 3-D Secure challenge as a failed off-session charge", async () => {
      const user = await createUser();
      const { stripe, client } = fakeStripe();
      const provider = new StripePaymentProvider(client);
      await provider.ensureCustomer(user.id, user.email);
      stripe.paymentIntents.create.mockResolvedValueOnce({ id: "pi_x", status: "requires_action" });

      expect(await provider.chargeSaved(charge({ userId: user.id }))).toEqual({
        status: "failed",
        reason: "authentication_required",
      });
    });

    it("lets an outage propagate instead of calling it a declined card", async () => {
      const user = await createUser();
      const { stripe, client } = fakeStripe();
      const provider = new StripePaymentProvider(client);
      await provider.ensureCustomer(user.id, user.email);
      stripe.paymentIntents.create.mockRejectedValueOnce(
        new Stripe.errors.StripeConnectionError({ type: "api_error", message: "network down" }),
      );

      await expect(provider.chargeSaved(charge({ userId: user.id }))).rejects.toThrow("network down");
    });
  });

  describe("checkout", () => {
    it("redirects to Stripe and creates nothing until the payment arrives", async () => {
      const user = await createUser();
      const { stripe, client } = fakeStripe();
      setPaymentProviderForTests(new StripePaymentProvider(client));

      const outcome = await checkout(user.id, INPUT, URLS);

      expect(outcome).toMatchObject({ redirectUrl: "https://checkout.stripe.test/pay" });
      const order = await prisma.order.findUniqueOrThrow({ where: { id: outcome.orderId } });
      expect(order).toMatchObject({
        status: "PENDING",
        serverId: null,
        paymentProvider: "stripe",
        paymentReference: expect.stringMatching(/^cs_test_/),
      });
      expect(await prisma.server.count({ where: { ownerId: user.id } })).toBe(0);
      expect(await prisma.invoice.count({ where: { userId: user.id } })).toBe(0);

      // The success page is told which order to wait for.
      const [params] = stripe.checkout.sessions.create.mock.calls[0] as unknown as [
        Stripe.Checkout.SessionCreateParams,
      ];
      expect(params.success_url).toBe(`${URLS.successUrl}?order=${outcome.orderId}`);
    });

    it("marks the order failed when Stripe cannot open a session", async () => {
      const user = await createUser();
      const { stripe, client } = fakeStripe();
      setPaymentProviderForTests(new StripePaymentProvider(client));
      stripe.checkout.sessions.create.mockRejectedValueOnce(new Error("stripe is down"));

      await expect(checkout(user.id, INPUT, URLS)).rejects.toThrow("stripe is down");

      const order = await prisma.order.findFirstOrThrow({ where: { userId: user.id } });
      expect(order.status).toBe("FAILED");
    });

    it("skips Stripe entirely for an order a coupon made free", async () => {
      const user = await createUser();
      const { stripe, client } = fakeStripe();
      setPaymentProviderForTests(new StripePaymentProvider(client));
      await prisma.coupon.create({ data: { code: "FREE", kind: "PERCENT", value: 100 } });

      const outcome = await checkout(user.id, { ...INPUT, couponCode: "FREE" }, URLS);

      expect(outcome).toHaveProperty("serverId");
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    });
  });

  describe("webhook events", () => {
    async function pendingOrder() {
      const user = await createUser();
      const fake = fakeStripe();
      setPaymentProviderForTests(new StripePaymentProvider(fake.client));
      const outcome = await checkout(user.id, INPUT, URLS);
      return { user, orderId: outcome.orderId, ...fake };
    }

    it("fulfils the order when the session completes", async () => {
      const { user, orderId } = await pendingOrder();

      expect(await handleStripeEvent(sessionEvent("checkout.session.completed", orderId))).toBe(
        "fulfilled",
      );

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe("PAID");
      expect(order.serverId).toBeTruthy();
      expect(await prisma.subscription.count({ where: { userId: user.id } })).toBe(1);
      expect(await prisma.invoice.count({ where: { userId: user.id, status: "PAID" } })).toBe(1);
    });

    it("survives Stripe delivering the same event twice", async () => {
      const { user, orderId } = await pendingOrder();

      await handleStripeEvent(sessionEvent("checkout.session.completed", orderId));
      await handleStripeEvent(sessionEvent("checkout.session.completed", orderId));

      expect(await prisma.server.count({ where: { ownerId: user.id } })).toBe(1);
      expect(await prisma.invoice.count({ where: { userId: user.id } })).toBe(1);
      expect(await prisma.subscription.count({ where: { userId: user.id } })).toBe(1);
    });

    it("waits for delayed payment methods that have not paid yet", async () => {
      const { user, orderId } = await pendingOrder();

      const outcome = await handleStripeEvent(
        sessionEvent("checkout.session.completed", orderId, "unpaid"),
      );

      expect(outcome).toBe("ignored");
      expect(await prisma.server.count({ where: { ownerId: user.id } })).toBe(0);

      await handleStripeEvent(sessionEvent("checkout.session.async_payment_succeeded", orderId));
      expect(await prisma.server.count({ where: { ownerId: user.id } })).toBe(1);
    });

    it("closes abandoned and failed checkouts", async () => {
      const abandoned = await pendingOrder();
      await handleStripeEvent(sessionEvent("checkout.session.expired", abandoned.orderId));
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: abandoned.orderId } })).status,
      ).toBe("CANCELLED");

      const failed = await pendingOrder();
      await handleStripeEvent(sessionEvent("checkout.session.async_payment_failed", failed.orderId));
      expect((await prisma.order.findUniqueOrThrow({ where: { id: failed.orderId } })).status).toBe(
        "FAILED",
      );
    });

    it("never reopens an order that was already paid", async () => {
      const { orderId } = await pendingOrder();
      await handleStripeEvent(sessionEvent("checkout.session.completed", orderId));

      // A late "expired" for the same session must not cancel a paid order.
      await handleStripeEvent(sessionEvent("checkout.session.expired", orderId));

      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PAID");
    });

    it("ignores event types it does not know", async () => {
      expect(await handleStripeEvent(sessionEvent("customer.created", null))).toBe("ignored");
    });

    it("rejects an event for an order that does not exist", async () => {
      await expect(
        handleStripeEvent(sessionEvent("checkout.session.completed", "missing")),
      ).rejects.toMatchObject({ code: "order_not_found" });
    });
  });

  describe("success page state", () => {
    it("verifies with Stripe when the webhook has not arrived", async () => {
      const user = await createUser();
      const { client, markPaid } = fakeStripe();
      setPaymentProviderForTests(new StripePaymentProvider(client));
      const { orderId } = await checkout(user.id, INPUT, URLS);

      expect(await getCheckoutState(orderId, user.id)).toEqual({ status: "pending" });

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      markPaid(order.paymentReference!);

      const state = await getCheckoutState(orderId, user.id);
      expect(state).toEqual({ status: "paid", serverId: expect.any(String) });
      // Asking again does not create a second server.
      await getCheckoutState(orderId, user.id);
      expect(await prisma.server.count({ where: { ownerId: user.id } })).toBe(1);
    });

    it("reports a closed order as failed and hides other people's orders", async () => {
      const user = await createUser();
      const stranger = await createUser();
      const { client } = fakeStripe();
      setPaymentProviderForTests(new StripePaymentProvider(client));
      const { orderId } = await checkout(user.id, INPUT, URLS);

      await expect(getCheckoutState(orderId, stranger.id)).rejects.toMatchObject({
        code: "order_not_found",
      });

      await handleStripeEvent(sessionEvent("checkout.session.expired", orderId));
      expect(await getCheckoutState(orderId, user.id)).toEqual({ status: "failed" });
    });
  });

  describe("billing engine with a real gateway", () => {
    it("keeps going when the gateway errors, without marking anyone past due", async () => {
      const [a, b] = await Promise.all([createUser(), createUser()]);
      const first = await createServerFor(a.id);
      const second = await createServerFor(b.id);
      await endPeriod(first.serverId);
      await endPeriod(second.serverId);
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

      let calls = 0;
      const report = await runBillingCycle(new Date(), {
        charge: async (request) => {
          calls += 1;
          if (calls === 1) throw new Error("gateway timeout");
          return { status: "succeeded", reference: `pi_${request.idempotencyKey}` };
        },
      });
      errorLog.mockRestore();

      expect(report).toMatchObject({ renewed: 1, failed: 0, errors: 1 });
      const statuses = await prisma.subscription.findMany({ select: { status: true } });
      // An outage is not a declined card: nobody became PAST_DUE.
      expect(statuses.map((s) => s.status)).toEqual(["ACTIVE", "ACTIVE"]);
    });

    it("does not apply an upgrade whose payment was declined", async () => {
      const user = await createUser();
      const { serverId } = await createServerFor(user.id, { ramGb: 4, vcpu: 2, storageGb: 20 });
      await setStatus(serverId, "STOPPED");

      await expect(
        resizeServer(serverId, user.id, { ramGb: 8, vcpu: 2, storageGb: 20 }, new Date(), {
          charge: async () => ({ status: "failed", reason: "card_declined" }),
        }),
      ).rejects.toMatchObject({ code: "payment_failed", status: 402 });

      const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
      expect(server.ramGb).toBe(4);
      const order = await prisma.order.findFirstOrThrow({ where: { serverId, kind: "RESIZE" } });
      expect(order.status).toBe("FAILED");
      expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(0);
    });
  });
});
