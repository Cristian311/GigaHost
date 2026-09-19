import { timingSafeEqual } from "node:crypto";
import { jsonError } from "@/server/api";

/**
 * Guards scheduler endpoints. Returns an error response, or null when the
 * request carries `Authorization: Bearer <CRON_SECRET>` (the header Vercel Cron
 * sends). Without a configured secret the endpoints stay closed rather than
 * open to anyone who finds the URL.
 */
export function rejectUnlessCron(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return jsonError(503, "cron_disabled", "CRON_SECRET is not set.");

  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  // timingSafeEqual throws on a length mismatch, hence the explicit check.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return jsonError(401, "unauthorized");
  }
  return null;
}
