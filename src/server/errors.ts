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
