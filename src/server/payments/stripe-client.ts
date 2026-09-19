import Stripe from "stripe";

let cached: Stripe | undefined;

/**
 * Created on first use rather than at import time, so a build (or a test run)
 * without STRIPE_SECRET_KEY can still load every module that mentions Stripe.
 */
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("PAYMENT_PROVIDER=stripe requires STRIPE_SECRET_KEY to be set.");
  }
  cached = new Stripe(key, { appInfo: { name: "GigaHost" } });
  return cached;
}

/** True when the app is configured to take real payments. */
export function isStripeEnabled(): boolean {
  return (process.env.PAYMENT_PROVIDER ?? "mock").toLowerCase() === "stripe";
}
