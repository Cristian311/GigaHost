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
  /** Another caller is already fulfilling this order; ask again shortly. */
  | "order_in_progress"
  | "subscription_not_found"
  | "nothing_due"
  | "payment_failed"
  | "rate_limited"
  | "invalid_token"
  | "email_not_verified"
  | "already_verified"
  | "cannot_demote_self"
  | "invalid_path"
  | "file_not_found"
  | "file_not_editable"
  | "file_too_large"
  | "path_exists"
  | "not_a_directory"
  | "server_not_running"
  | "server_unavailable"
  | "task_limit"
  | "task_not_found"
  | "addon_not_found"
  | "addon_incompatible"
  | "addon_already_installed"
  | "addon_not_installed"
  | "region_code_taken"
  | "game_not_configured"
  | "region_not_configured"
  | "no_capacity"
  | "provider_error"
  | "provider_unavailable"
  | "provider_not_configured"
  | "not_found"
  | "ticket_not_found"
  | "ticket_closed"
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
