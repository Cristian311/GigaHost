import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/server/errors";
import { ForbiddenError, UnauthorizedError } from "@/server/auth-guard";

export function jsonError(status: number, code: string, details?: unknown) {
  return NextResponse.json({ error: code, details: details ?? null }, { status });
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Server actions get an origin check from Next.js; plain route handlers do not,
 * and these are cookie-authenticated, so a form on another site could power off
 * a server or trigger a resize that charges a card. Browsers always send Origin
 * on a cross-origin request, so a mismatch is rejected and an absent header is
 * allowed — that is the server-to-server case (Stripe webhooks, the scheduler),
 * which carries its own signature or bearer token.
 */
function crossOriginRejection(request: Request): Response | null {
  if (SAFE_METHODS.has(request.method)) return null;

  const origin = request.headers.get("origin");
  if (!origin) return null;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return jsonError(403, "cross_origin");
  }

  // The proxy's forwarded host is what the browser actually typed.
  const expected = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const allowed = new Set([expected, new URL(request.url).host].filter(Boolean));

  return allowed.has(originHost) ? null : jsonError(403, "cross_origin");
}

/**
 * Codes whose `details` are written for the customer and are safe to show:
 * limits they have hit, minimums they are under, how long to wait. Everything
 * else falls back to the code alone.
 *
 * The fallback matters because `AppError.message` often carries whatever the
 * provider said, and a Pterodactyl failure quotes the panel's URL and internal
 * error text — which tells an attacker where the infrastructure lives.
 */
const CODES_WITH_SAFE_DETAILS = new Set([
  "validation",
  "below_minimum",
  "rate_limited",
  "backup_limit",
  "task_limit",
  "coupon_min_order",
  "file_too_large",
]);

export function clientSafeDetails(error: AppError): unknown {
  if (!CODES_WITH_SAFE_DETAILS.has(error.code)) return null;
  return error.details ?? null;
}

/**
 * Wraps a route handler: rejects cross-origin writes and converts known errors
 * into JSON responses. The request is required so the origin check cannot be
 * forgotten when a route is added.
 */
export async function withApi(
  request: Request,
  handler: () => Promise<Response>,
): Promise<Response> {
  const rejected = crossOriginRejection(request);
  if (rejected) return rejected;

  try {
    return await handler();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(400, "validation", z.flattenError(error));
    }
    if (error instanceof UnauthorizedError) return jsonError(401, "unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "forbidden");
    if (error instanceof AppError) {
      const response = jsonError(error.status, error.code, clientSafeDetails(error));
      const retryAfter = (error.details as { retryAfterSeconds?: number } | undefined)
        ?.retryAfterSeconds;
      if (error.status === 429 && retryAfter) response.headers.set("Retry-After", String(retryAfter));
      return response;
    }
    console.error(error);
    return jsonError(500, "internal_error");
  }
}

export async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError("validation", 400, "Body must be valid JSON.");
  }
  return schema.parse(body);
}
