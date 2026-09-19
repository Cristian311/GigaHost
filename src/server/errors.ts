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
