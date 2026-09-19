import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { AppError } from "@/server/errors";
import { getStripeProvider } from "@/server/payments";
import { fulfilOrder } from "./order-service";

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

export type WebhookOutcome = "fulfilled" | "closed" | "ignored";

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
