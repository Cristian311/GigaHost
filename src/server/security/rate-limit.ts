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
  /**
   * Per account, independent of where the attempts come from. This is the one
   * that actually stops password guessing: the address can be spoofed or come
   * from a botnet, the account being attacked cannot.
   */
  loginPerAccount: { limit: 20, windowMs: 15 * MINUTE },
  register: { limit: 5, windowMs: HOUR },
  passwordReset: { limit: 5, windowMs: HOUR },
  passwordResetPerEmail: { limit: 3, windowMs: HOUR },
  verificationEmail: { limit: 3, windowMs: HOUR },
  couponPreview: { limit: 30, windowMs: MINUTE },
  checkout: { limit: 10, windowMs: 10 * MINUTE },
  // Keyed on the user id rather than the address: a signed-in caller cannot
  // rotate that the way X-Forwarded-For can be rotated. Sized to sit well above
  // anything a person does by hand and well below what a script does.
  ticketCreate: { limit: 10, windowMs: HOUR },
  ticketMessage: { limit: 40, windowMs: 10 * MINUTE },
  consoleCommand: { limit: 60, windowMs: MINUTE },
  passwordChange: { limit: 5, windowMs: HOUR },
  /** Each resize charges or credits a card, so repeats are worth capping. */
  resize: { limit: 10, windowMs: HOUR },
  /** Power cycling: generous for a person, a brake on a script. */
  serverPower: { limit: 30, windowMs: 10 * MINUTE },
  /** File writes and directory work hit the provider's API for each call. */
  serverFiles: { limit: 120, windowMs: 10 * MINUTE },
  /** Backups are expensive in storage and provider time. */
  backups: { limit: 20, windowMs: HOUR },
  /**
   * The public price quote. Unauthenticated, so this is keyed on the address
   * and generous: the configurator recalculates on every slider move.
   */
  quote: { limit: 120, windowMs: MINUTE },
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
 * Number of reverse proxies in front of the app, from `TRUSTED_PROXY_HOPS`.
 *
 * `X-Forwarded-For` is appended to by each hop, so the entries a client sent
 * itself end up on the *left* and the ones added by infrastructure you control
 * on the right. Reading the leftmost entry therefore reads whatever the client
 * typed, which lets an attacker rotate it and get a fresh rate-limit bucket for
 * every password guess. Counting in from the right skips forged entries.
 *
 * 0 (the default) means the app is exposed directly and the header is ignored
 * entirely — trusting it there would be the same hole.
 */
function trustedHops(): number {
  const raw = Number(process.env.TRUSTED_PROXY_HOPS ?? "0");
  return Number.isInteger(raw) && raw >= 0 ? raw : 0;
}

/**
 * Client address, as far as it can be trusted.
 *
 * Never returns a client-controlled value: with no trusted proxy configured
 * every caller shares one bucket, which throttles more than it should but can
 * never be bypassed. Pair it with a limit keyed on something stable (the email
 * being logged into, the signed-in user id) so a shared bucket is not the only
 * thing standing in the way.
 */
export function clientIp(headers: Headers): string {
  const hops = trustedHops();
  if (hops === 0) return headers.get("x-real-ip")?.trim() || "unknown";

  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  // The entry added by the outermost proxy we trust: `hops` from the right.
  const index = chain.length - hops;
  return chain[index] || "unknown";
}
