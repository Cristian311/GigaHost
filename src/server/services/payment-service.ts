import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { AppError } from "@/server/errors";
import { getStripeProvider } from "@/server/payments";
import { getProvider } from "@/server/providers";
import { recordEvent } from "./event-service";
import { fulfilOrder } from "./order-service";
import { toRef } from "./server-service";

export type CheckoutState =
  | { status: "paid"; serverId: string }
  | { status: "pending" }
  | { status: "failed" };

/**
 * What the success page polls. The webhook normally fulfils the order, but it
 * may be late or, in local development, not configured at all; in that case the
 * session is verified with Stripe directly. Either path ends in `fulfilOrder`,
 * which is idempotent, so they can race safely.
 */
export async function getCheckoutState(orderId: string, userId: string): Promise<CheckoutState> {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId, kind: "NEW" } });
  if (!order) throw new AppError("order_not_found", 404);

  if (order.status === "PAID") {
    return order.serverId ? { status: "paid", serverId: order.serverId } : { status: "pending" };
  }
  if (order.status !== "PENDING") return { status: "failed" };

  const stripe = getStripeProvider();
  if (stripe && order.paymentProvider === "stripe" && order.paymentReference) {
    if (await stripe.isCheckoutPaid(order.paymentReference)) {
      const fulfilled = await fulfilOrder(order.id);
      return { status: "paid", serverId: fulfilled.serverId };
    }
  }
  return { status: "pending" };
}

/** Closes an order whose hosted checkout was abandoned or could not be paid. */
async function closeUnpaidOrder(orderId: string | undefined, status: "CANCELLED" | "FAILED") {
  if (!orderId) return;
  await prisma.order.updateMany({
    where: { id: orderId, status: "PENDING", kind: "NEW" },
    data: { status },
  });
}

export type WebhookOutcome = "fulfilled" | "closed" | "refunded" | "disputed" | "ignored";

/**
 * Finds the order a charge belongs to. Stripe reports refunds and disputes
 * against the payment intent or the charge, neither of which is what the order
 * stores for a hosted checkout — so both the reference and the metadata are
 * tried.
 */
async function orderForCharge(reference: string | null, orderId?: string | null) {
  if (orderId) {
    const byId = await prisma.order.findUnique({ where: { id: orderId } });
    if (byId) return byId;
  }
  if (!reference) return null;
  return prisma.order.findFirst({ where: { paymentReference: reference } });
}

/**
 * Money went back to the customer, whether they asked or their bank decided.
 *
 * The server is suspended rather than deleted: a refund is often the end of a
 * dispute that may yet be resolved, and deleting a world is not reversible.
 * An admin decides what happens next.
 */
async function reverseOrder(
  order: { id: string; serverId: string | null },
  outcome: "REFUNDED" | "DISPUTED",
  reason: string,
) {
  await prisma.$transaction([
    prisma.order.update({ where: { id: order.id }, data: { status: outcome } }),
    prisma.invoice.updateMany({
      where: { orderId: order.id, status: "PAID" },
      data: { status: outcome === "REFUNDED" ? "REFUNDED" : "VOID" },
    }),
  ]);

  if (!order.serverId) return;

  const server = await prisma.server.findUnique({ where: { id: order.serverId } });
  if (!server || server.status === "DELETED") return;

  // Stop the service being given away, without destroying anything.
  const ref = toRef(server);
  if (ref) {
    try {
      await getProvider().suspend(ref);
    } catch (error) {
      console.error(`[payments] could not suspend ${server.id} after a ${outcome}`, error);
    }
  }
  await prisma.server.update({
    where: { id: server.id },
    data: { status: "SUSPENDED", statusChangedAt: new Date(), suspensionReason: "ADMIN" },
  });
  await recordEvent(server.id, outcome, reason);
}

/**
 * Applies a verified Stripe event. Unknown event types are acknowledged and
 * ignored, so enabling more events in the Stripe dashboard cannot break the
 * endpoint.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<WebhookOutcome> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      // "completed" also fires for delayed payment methods that have not paid yet.
      if (session.payment_status !== "paid") return "ignored";
      const orderId = session.metadata?.orderId ?? session.client_reference_id;
      if (!orderId) return "ignored";
      await fulfilOrder(orderId);
      return "fulfilled";
    }
    case "checkout.session.expired": {
      const session = event.data.object;
      await closeUnpaidOrder(session.metadata?.orderId ?? undefined, "CANCELLED");
      return "closed";
    }
    case "checkout.session.async_payment_failed": {
      const session = event.data.object;
      await closeUnpaidOrder(session.metadata?.orderId ?? undefined, "FAILED");
      return "closed";
    }
    case "charge.refunded": {
      const charge = event.data.object;
      const order = await orderForCharge(
        charge.payment_intent ? String(charge.payment_intent) : charge.id,
        charge.metadata?.orderId,
      );
      // Nothing to reverse if it was never marked paid here.
      if (!order || order.status !== "PAID") return "ignored";
      await reverseOrder(order, "REFUNDED", "Payment refunded");
      return "refunded";
    }

    case "charge.dispute.created": {
      const dispute = event.data.object;
      const order = await orderForCharge(
        dispute.payment_intent ? String(dispute.payment_intent) : String(dispute.charge),
        dispute.metadata?.orderId,
      );
      if (!order || order.status !== "PAID") return "ignored";
      await reverseOrder(order, "DISPUTED", `Chargeback opened: ${dispute.reason}`);
      return "disputed";
    }

    case "charge.dispute.closed": {
      const dispute = event.data.object;
      // Only a win puts things back; a loss leaves the order DISPUTED.
      if (dispute.status !== "won") return "ignored";
      const order = await orderForCharge(
        dispute.payment_intent ? String(dispute.payment_intent) : String(dispute.charge),
        dispute.metadata?.orderId,
      );
      if (!order || order.status !== "DISPUTED") return "ignored";

      await prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } });
      await prisma.invoice.updateMany({
        where: { orderId: order.id, status: "VOID" },
        data: { status: "PAID" },
      });
      // The suspension was ours, so lifting it is a decision for an admin who
      // can see why it happened; the record is corrected either way.
      if (order.serverId) {
        await recordEvent(order.serverId, "DISPUTED", "Chargeback resolved in our favour");
      }
      return "refunded";
    }

    default:
      return "ignored";
  }
}

/** URL of the Stripe-hosted page for replacing the saved card, if there is one. */
export async function getPaymentPortalUrl(userId: string, returnUrl: string) {
  const stripe = getStripeProvider();
  if (!stripe) return null;
  return stripe.createPortalUrl(userId, returnUrl);
}
