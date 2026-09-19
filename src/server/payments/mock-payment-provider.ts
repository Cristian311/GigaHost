import type {
  ChargeRequest,
  ChargeResult,
  CheckoutRequest,
  CheckoutResult,
  PaymentProvider,
} from "./types";

/** Simulated gateway: every payment succeeds instantly. */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;

  async startCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    return { kind: "paid", reference: `mock_co_${request.orderId}` };
  }

  async chargeSaved(request: ChargeRequest): Promise<ChargeResult> {
    return { status: "succeeded", reference: `mock_ch_${request.orderId}` };
  }
}
