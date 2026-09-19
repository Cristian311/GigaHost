import { MockPaymentProvider } from "./mock-payment-provider";
import { getStripe, isStripeEnabled } from "./stripe-client";
import { StripePaymentProvider } from "./stripe-payment-provider";
import type { PaymentProvider } from "./types";

let cached: PaymentProvider | undefined;

/** Returns the configured payment gateway (PAYMENT_PROVIDER=mock|stripe). */
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;
  cached = isStripeEnabled() ? new StripePaymentProvider(getStripe()) : new MockPaymentProvider();
  return cached;
}

/** The Stripe provider when it is the active gateway, otherwise null. */
export function getStripeProvider(): StripePaymentProvider | null {
  const provider = getPaymentProvider();
  return provider instanceof StripePaymentProvider ? provider : null;
}

/** Tests swap the gateway without touching process.env. */
export function setPaymentProviderForTests(provider: PaymentProvider | undefined) {
  cached = provider;
}

export { isStripeEnabled };
export type * from "./types";
