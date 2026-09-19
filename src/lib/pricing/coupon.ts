export type CouponRule = {
  kind: "PERCENT" | "FIXED";
  /** Percentage (1-100) or cents, depending on `kind`. */
  value: number;
};

/**
 * Discount a coupon gives on an amount, in integer cents. Never negative and
 * never more than the amount itself, so a total can reach zero but not go below.
 */
export function couponDiscount(coupon: CouponRule, amountCents: number): number {
  if (amountCents <= 0 || coupon.value <= 0) return 0;
  const raw =
    coupon.kind === "PERCENT"
      ? Math.round((amountCents * Math.min(coupon.value, 100)) / 100)
      : coupon.value;
  return Math.min(raw, amountCents);
}

/** Coupon codes are stored and compared upper-case, without surrounding spaces. */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}
