export type CheckoutRequest = {
  /** Our order id. Echoed back by the gateway so the webhook can find the order. */
  orderId: string;
  userId: string;
  userEmail: string;
  amountCents: number;
  currency: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutResult =
  /** Settled on the spot: the caller fulfils the order immediately. */
  | { kind: "paid"; reference: string }
  /** Hosted checkout: the customer pays there and a webhook fulfils the order. */
  | { kind: "redirect"; url: string; reference: string };

export type ChargeRequest = {
  orderId: string;
  /**
   * Unique per attempt, not per order: gateways replay the first response for a
   * repeated key, so reusing it would turn every retry into the same failure.
   * Within one attempt it still stops a crashed-and-rerun job charging twice.
   */
  idempotencyKey: string;
  userId: string;
  amountCents: number;
  currency: string;
  description: string;
};

export type ChargeResult =
  | { status: "succeeded"; reference: string }
  | { status: "failed"; reason: string };

/**
 * Everything that moves money goes through this interface, mirroring
 * ServerProvider. GigaHost keeps its own billing engine (proration, credit,
 * coupons, renewals); the gateway only collects the amounts it is told to.
 */
export interface PaymentProvider {
  readonly name: "mock" | "stripe";
  /** First payment, with the customer present. */
  startCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  /** Charges the customer's saved payment method (renewals, upgrades). */
  chargeSaved(request: ChargeRequest): Promise<ChargeResult>;
}

export type ChargeFn = PaymentProvider["chargeSaved"];
