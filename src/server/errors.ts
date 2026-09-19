export type AppErrorCode =
  | "game_not_found"
  | "game_unavailable"
  | "region_not_found"
  | "below_minimum"
  | "server_not_found"
  | "invalid_transition"
  | "email_taken"
  | "invalid_credentials"
  | "pricing_missing"
  | "no_change"
  | "backup_limit"
  | "backup_not_found"
  | "coupon_not_found"
  | "coupon_expired"
  | "coupon_exhausted"
  | "coupon_already_used"
  | "coupon_min_order"
  | "coupon_code_taken"
  | "order_not_found"
  | "subscription_not_found"
  | "nothing_due"
  | "payment_failed"
  | "not_found"
  | "validation";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    public readonly status: number = 400,
    message?: string,
    public readonly details?: unknown,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}
