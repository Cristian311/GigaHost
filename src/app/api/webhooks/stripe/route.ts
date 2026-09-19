import { NextResponse } from "next/server";
import { jsonError } from "@/server/api";
import { AppError } from "@/server/errors";
import { getStripe } from "@/server/payments/stripe-client";
import { handleStripeEvent } from "@/server/services/payment-service";

/**
 * Stripe webhook. The signature is checked against the raw request body, which
 * is why this reads `request.text()` and never `request.json()`.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return jsonError(503, "webhook_disabled", "STRIPE_WEBHOOK_SECRET is not set.");

  const signature = request.headers.get("stripe-signature");
  if (!signature) return jsonError(400, "missing_signature");

  const payload = await request.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    return jsonError(400, "invalid_signature");
  }

  try {
    const outcome = await handleStripeEvent(event);
    return NextResponse.json({ received: true, outcome });
  } catch (error) {
    // Retrying cannot fix an order that does not exist or is already closed, so
    // acknowledge it; anything else gets a 500 and Stripe redelivers later.
    if (error instanceof AppError) {
      console.error(`Stripe event ${event.id} (${event.type}) rejected: ${error.code}`);
      return NextResponse.json({ received: true, outcome: "rejected", reason: error.code });
    }
    console.error(`Stripe event ${event.id} (${event.type}) failed`, error);
    return jsonError(500, "internal_error");
  }
}
