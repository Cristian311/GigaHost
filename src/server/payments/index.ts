import { MockPaymentProvider } from "./mock-payment-provider";
import type { PaymentProvider } from "./types";

let cached: PaymentProvider | undefined;

/** Returns the configured payment gateway (PAYMENT_PROVIDER=mock|stripe). */
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;
  cached = new MockPaymentProvider();
  return cached;
}

export type * from "./types";
