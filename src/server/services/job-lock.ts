import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/**
 * How long a run may hold a job before another one is allowed to take over.
 * Long enough that a slow-but-alive run is never overtaken, short enough that a
 * crashed one does not block the schedule for a day.
 */
export const JOB_LOCK_TTL_MS = 30 * 60_000;

/** The recurring jobs, plus a per-order lease used while fulfilling a payment. */
export type JobName = "billing-cycle" | "due-tasks" | `order:${string}`;

/**
 * A lease in the database rather than `GET_LOCK`, which is tied to one
 * connection and so cannot survive a pool, and rather than an in-memory flag,
 * which would not be seen by a second instance.
 *
 * Returns a release function, or null when someone else holds the lease.
 */
async function acquire(
  name: JobName,
  ttlMs: number,
  now: Date,
): Promise<(() => Promise<void>) | null> {
  const holder = randomUUID();
  const expiresAt = new Date(now.getTime() + ttlMs);

  const release = async () => {
    // Scoped to this holder: a run whose lease already expired and was taken
    // over by someone else must not release the new owner's lock.
    await prisma.jobLock.deleteMany({ where: { name, holder } });
  };

  try {
    await prisma.jobLock.create({ data: { name, holder, acquiredAt: now, expiresAt } });
    return release;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
  }

  // A row exists. Take it over only if its lease has run out; the condition is
  // part of the UPDATE, so two instances cannot both win it.
  const { count } = await prisma.jobLock.updateMany({
    where: { name, expiresAt: { lte: now } },
    data: { holder, acquiredAt: now, expiresAt },
  });

  return count === 1 ? release : null;
}

/**
 * Runs `work` while holding the named lease, or returns null without running it
 * when another scheduler already holds it.
 *
 * Both billing and scheduled tasks read rows and then act on them without
 * claiming each row, so two overlapping runs would charge a card twice or
 * restart a server twice. Overlap is easy to cause: an hourly cron that runs
 * long, two app instances, or the admin's "run now" button pressed during a
 * scheduled run.
 */
export async function withJobLock<T>(
  name: JobName,
  work: () => Promise<T>,
  options: { ttlMs?: number; now?: Date } = {},
): Promise<T | null> {
  const now = options.now ?? new Date();
  const release = await acquire(name, options.ttlMs ?? JOB_LOCK_TTL_MS, now);
  if (!release) return null;

  try {
    return await work();
  } finally {
    await release();
  }
}

/** Housekeeping: leases whose run died long ago. */
export async function purgeExpiredJobLocks(now: Date = new Date()) {
  const { count } = await prisma.jobLock.deleteMany({ where: { expiresAt: { lte: now } } });
  return count;
}
