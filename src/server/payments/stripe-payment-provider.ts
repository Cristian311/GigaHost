import Stripe from "stripe";
import { prisma } from "@/lib/db";
import type {
  ChargeRequest,
  ChargeResult,
  CheckoutRequest,
  CheckoutResult,
  PaymentProvider,
} from "./types";

/** The slice of the Stripe SDK this provider uses; tests inject a fake one. */
export type StripeLike = Pick<
  Stripe,
  "customers" | "checkout" | "paymentMethods" | "paymentIntents" | "billingPortal"
>;

/**
 * Stripe as a card processor only. GigaHost's own engine decides what is owed
 * (proration, credit, coupons, renewals), so instead of Stripe Subscriptions
 * this uses one-off payments: a hosted Checkout Session for the first payment,
 * which also saves the card, and off-session PaymentIntents for everything the
 * billing cycle charges later.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe" as const;

  constructor(private readonly stripe: StripeLike) {}

  /** Returns the customer's Stripe id, creating the customer on first use. */
  async ensureCustomer(userId: string, email: string): Promise<string> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.stripeCustomerId) return user.stripeCustomerId;

    const customer = await this.stripe.customers.create(
      { email, name: user.name ?? undefined, metadata: { userId } },
      { idempotencyKey: `customer:${userId}` },
    );
    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customer.id },
    });
    return customer.id;
  }

  async startCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const customer = await this.ensureCustomer(request.userId, request.userEmail);

    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer,
        client_reference_id: request.orderId,
        metadata: { orderId: request.orderId },
        payment_intent_data: {
          // Keeps the card on the customer so renewals can be charged later.
          setup_future_usage: "off_session",
          description: request.description,
          metadata: { orderId: request.orderId },
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: request.currency.toLowerCase(),
              unit_amount: request.amountCents,
              product_data: { name: request.description },
            },
          },
        ],
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
      },
      { idempotencyKey: `checkout:${request.orderId}` },
    );

    if (!session.url) throw new Error(`Stripe returned no URL for session ${session.id}.`);
    return { kind: "redirect", url: session.url, reference: session.id };
  }

  async chargeSaved(request: ChargeRequest): Promise<ChargeResult> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.userId } });
    if (!user.stripeCustomerId) return { status: "failed", reason: "no_payment_method" };

    const methods = await this.stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: "card",
      limit: 1,
    });
    const method = methods.data[0];
    if (!method) return { status: "failed", reason: "no_payment_method" };

    try {
      const intent = await this.stripe.paymentIntents.create(
        {
          amount: request.amountCents,
          currency: request.currency.toLowerCase(),
          customer: user.stripeCustomerId,
          payment_method: method.id,
          off_session: true,
          confirm: true,
          description: request.description,
          metadata: { orderId: request.orderId },
        },
        { idempotencyKey: request.idempotencyKey },
      );

      if (intent.status === "succeeded") return { status: "succeeded", reference: intent.id };
      // Off-session there is nobody to complete 3-D Secure, so anything short of
      // "succeeded" means the customer has to come back and pay.
      return {
        status: "failed",
        reason: intent.status === "requires_action" ? "authentication_required" : intent.status,
      };
    } catch (error) {
      // A declined card is an expected outcome; anything else (network, bad
      // request, outage) is not the customer's fault and must not mark them
      // past due, so it propagates.
      if (error instanceof Stripe.errors.StripeCardError) {
        return { status: "failed", reason: error.decline_code ?? error.code ?? "card_declined" };
      }
      throw error;
    }
  }

  /** Verifies a Checkout Session with Stripe itself. */
  async isCheckoutPaid(sessionId: string): Promise<boolean> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    return session.payment_status === "paid";
  }

  /** Stripe-hosted page where the customer replaces their card. */
  async createPortalUrl(userId: string, returnUrl: string): Promise<string | null> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.stripeCustomerId) return null;
    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });
    return session.url;
  }
}
