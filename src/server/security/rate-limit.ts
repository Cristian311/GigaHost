import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/server/errors";

export type RateLimitRule = {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** One place to see, and tune, every limit the app enforces. */
export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 15 * MINUTE },
  register: { limit: 5, windowMs: HOUR },
  passwordReset: { limit: 5, windowMs: HOUR },
  passwordResetPerEmail: { limit: 3, windowMs: HOUR },
  verificationEmail: { limit: 3, windowMs: HOUR },
  couponPreview: { limit: 30, windowMs: MINUTE },
  checkout: { limit: 10, windowMs: 10 * MINUTE },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Fixed-window counter kept in the database, so it holds across server
 * instances and restarts. The increment is a single atomic statement, so
 * concurrent requests are all counted; only the window reset can race, and the
 * worst outcome there is one extra request.
 */
export async function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const expiresAt = new Date(now.getTime() + rule.windowMs);

  let row;
  try {
    row = await prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, expiresAt },
      update: { count: { increment: 1 } },
    });
  } catch (error) {
    // Prisma's upsert is a read followed by a write, so two first requests for
    // the same key can both try to insert. The loser finds the row in place and
    // simply counts itself on it.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
    row = await prisma.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
  }

  if (row.expiresAt <= now) {
    row = await prisma.rateLimit.update({ where: { key }, data: { count: 1, expiresAt } });
  }

  const allowed = row.count <= rule.limit;
  return {
    allowed,
    remaining: Math.max(0, rule.limit - row.count),
    retryAfterSeconds: allowed
      ? 0
      : Math.max(1, Math.ceil((row.expiresAt.getTime() - now.getTime()) / 1000)),
  };
}

/** Throws `rate_limited` (429) once the rule is exceeded. */
export async function assertRateLimit(key: string, rule: RateLimitRule, now?: Date) {
  const result = await consumeRateLimit(key, rule, now);
  if (!result.allowed) {
    throw new AppError("rate_limited", 429, undefined, {
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
  return result;
}

/** Forgets a counter, e.g. failed logins after a successful one. */
export async function clearRateLimit(key: string) {
  await prisma.rateLimit.deleteMany({ where: { key } });
}

/** Housekeeping for the scheduler. */
export async function purgeExpiredRateLimits(now: Date = new Date()) {
  const { count } = await prisma.rateLimit.deleteMany({ where: { expiresAt: { lte: now } } });
  return count;
}

/**
 * Best-effort client address. Behind a proxy the first entry of
 * X-Forwarded-For is the client; without one there is nothing better than a
 * shared bucket, which still caps the total.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
