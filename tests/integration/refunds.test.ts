import { beforeEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { createOrder, fulfilOrder } from "@/server/services/order-service";
import { handleStripeEvent } from "@/server/services/payment-service";
import { createUser, resetData } from "../setup/db";

const ORDER_INPUT = {
  name: "Refunded server",
  gameSlug: "minecraft-paper",
  ramGb: 8,
  vcpu: 4,
  storageGb: 50,
  regionCode: "eu-ro",
  billingPeriod: "MONTHLY",
  waiveWithdrawal: true,
} as const;

function chargeEvent(type: "charge.refunded", orderId: string): Stripe.Event {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type,
    data: {
      object: {
        id: "ch_test",
        object: "charge",
        payment_intent: "pi_test",
        metadata: { orderId },
      },
    },
  } as unknown as Stripe.Event;
}

function disputeEvent(
  type: "charge.dispute.created" | "charge.dispute.closed",
  orderId: string,
  options: { status?: string; reason?: string } = {},
): Stripe.Event {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type,
    data: {
      object: {
        id: "dp_test",
        object: "dispute",
        charge: "ch_test",
        payment_intent: "pi_test",
        reason: options.reason ?? "fraudulent",
        status: options.status ?? "needs_response",
        metadata: { orderId },
      },
    },
  } as unknown as Stripe.Event;
}

/**
 * Only `checkout.session.*` used to be handled, so a refunded or disputed
 * payment left the order marked PAID and the server running: the customer had
 * their money back and the service as well.
 */
describe("refunds and chargebacks", () => {
  beforeEach(resetData);

  async function paidServer() {
    const user = await createUser();
    const order = await createOrder(user.id, ORDER_INPUT);
    const { serverId } = await fulfilOrder(order.id);
    return { user, orderId: order.id, serverId };
  }

  describe("refunds", () => {
    it("marks the order refunded and its invoice with it", async () => {
      const { orderId } = await paidServer();

      expect(await handleStripeEvent(chargeEvent("charge.refunded", orderId))).toBe("refunded");

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe("REFUNDED");
      const invoice = await prisma.invoice.findFirstOrThrow({ where: { orderId } });
      expect(invoice.status).toBe("REFUNDED");
    });

    it("suspends the server rather than deleting it", async () => {
      const { orderId, serverId } = await paidServer();

      await handleStripeEvent(chargeEvent("charge.refunded", orderId));

      const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
      // A world is not recoverable, and a refund is often not the end of it.
      expect(server.status).toBe("SUSPENDED");
      expect(server.suspensionReason).toBe("ADMIN");
    });

    it("leaves a trail on the server", async () => {
      const { orderId, serverId } = await paidServer();
      await handleStripeEvent(chargeEvent("charge.refunded", orderId));

      const events = await prisma.serverEvent.findMany({ where: { serverId, type: "REFUNDED" } });
      expect(events).toHaveLength(1);
    });

    it("ignores a refund for an order that was never paid here", async () => {
      const user = await createUser();
      const order = await createOrder(user.id, ORDER_INPUT);

      expect(await handleStripeEvent(chargeEvent("charge.refunded", order.id))).toBe("ignored");
      const unchanged = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(unchanged.status).toBe("PENDING");
    });

    it("ignores a refund it cannot match to an order", async () => {
      expect(await handleStripeEvent(chargeEvent("charge.refunded", "nope"))).toBe("ignored");
    });

    it("is safe to redeliver", async () => {
      const { orderId } = await paidServer();
      await handleStripeEvent(chargeEvent("charge.refunded", orderId));

      // Stripe redelivers; the second pass must not do anything again.
      expect(await handleStripeEvent(chargeEvent("charge.refunded", orderId))).toBe("ignored");
      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe("REFUNDED");
    });
  });

  describe("chargebacks", () => {
    it("marks the order disputed and suspends the server", async () => {
      const { orderId, serverId } = await paidServer();

      expect(await handleStripeEvent(disputeEvent("charge.dispute.created", orderId))).toBe(
        "disputed",
      );

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe("DISPUTED");
      const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
      expect(server.status).toBe("SUSPENDED");
    });

    it("records why", async () => {
      const { orderId, serverId } = await paidServer();
      await handleStripeEvent(
        disputeEvent("charge.dispute.created", orderId, { reason: "product_not_received" }),
      );

      const event = await prisma.serverEvent.findFirstOrThrow({
        where: { serverId, type: "DISPUTED" },
      });
      expect(event.message).toContain("product_not_received");
    });

    it("restores the order when the dispute is won", async () => {
      const { orderId } = await paidServer();
      await handleStripeEvent(disputeEvent("charge.dispute.created", orderId));

      await handleStripeEvent(disputeEvent("charge.dispute.closed", orderId, { status: "won" }));

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe("PAID");
      const invoice = await prisma.invoice.findFirstOrThrow({ where: { orderId } });
      expect(invoice.status).toBe("PAID");
    });

    it("leaves a lost dispute alone", async () => {
      const { orderId } = await paidServer();
      await handleStripeEvent(disputeEvent("charge.dispute.created", orderId));

      expect(
        await handleStripeEvent(disputeEvent("charge.dispute.closed", orderId, { status: "lost" })),
      ).toBe("ignored");

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe("DISPUTED");
    });
  });
});
