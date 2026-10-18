import { prisma } from "@/lib/db";

/** Long enough to spot a pattern, short enough not to become a table nobody prunes. */
export const CRON_RUN_RETENTION_DAYS = 30;

const DETAIL_LIMIT = 4_000;

export type CronJobName = "billing-cycle" | "due-tasks";

function summarise(value: unknown): string {
  const text = value instanceof Error ? value.message : JSON.stringify(value);
  return (text ?? "").slice(0, DETAIL_LIMIT);
}

/**
 * Runs a scheduled job and records what happened.
 *
 * Wrapping rather than logging, so the record is written whether the job
 * returns or throws — a failure that only reaches stdout is a failure nobody
 * finds until a customer complains.
 */
export async function recordedRun<T>(job: CronJobName, work: () => Promise<T>): Promise<T> {
  const run = await prisma.cronRun.create({ data: { job } });
  const startedAt = Date.now();

  const finish = (ok: boolean, detail: unknown) =>
    prisma.cronRun
      .update({
        where: { id: run.id },
        data: {
          ok,
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          detail: summarise(detail),
        },
      })
      // The job's own outcome matters more than the bookkeeping about it.
      .catch((error) => console.error(`[cron] could not record the ${job} run`, error));

  try {
    const result = await work();
    await finish(true, result);
    return result;
  } catch (error) {
    await finish(false, error);
    throw error;
  }
}

/** Most recent runs, newest first, for the admin page. */
export async function listCronRuns(limit = 50) {
  return prisma.cronRun.findMany({ orderBy: { startedAt: "desc" }, take: limit });
}

/**
 * How long a job may go without running before it counts as stalled rather than
 * merely idle. Derived from the schedule the README asks for, with slack: the
 * billing cycle is hourly and tasks run every few minutes.
 */
const STALE_AFTER_MS: Record<CronJobName, number> = {
  "billing-cycle": 3 * 3_600_000,
  "due-tasks": 30 * 60_000,
};

export type CronJobHealth = {
  job: CronJobName;
  /** "ok" · "failing" (it ran and threw) · "stale" (it has stopped being called). */
  state: "ok" | "failing" | "stale";
  lastRunAt: Date | null;
  lastDurationMs: number | null;
  lastFailureDetail: string | null;
  failuresLast24h: number;
};

/**
 * How each job is doing: is the scheduler calling it, and is what it calls
 * working? Evaluated here rather than in the component, so the clock is read
 * once, on the server, instead of during a render.
 */
export async function cronHealth(
  jobs: CronJobName[] = ["billing-cycle", "due-tasks"],
  now: Date = new Date(),
): Promise<CronJobHealth[]> {
  return Promise.all(
    jobs.map(async (job) => {
      const [last, lastFailure, failuresLast24h] = await Promise.all([
        prisma.cronRun.findFirst({ where: { job }, orderBy: { startedAt: "desc" } }),
        prisma.cronRun.findFirst({ where: { job, ok: false }, orderBy: { startedAt: "desc" } }),
        prisma.cronRun.count({
          where: { job, ok: false, startedAt: { gte: new Date(now.getTime() - 86_400_000) } },
        }),
      ]);

      // Stale first: a job nobody calls cannot be reported as healthy just
      // because its last run, three days ago, happened to succeed.
      const stale = !last || now.getTime() - last.startedAt.getTime() > STALE_AFTER_MS[job];

      return {
        job,
        state: stale ? "stale" : failuresLast24h > 0 ? "failing" : "ok",
        lastRunAt: last?.startedAt ?? null,
        lastDurationMs: last?.durationMs ?? null,
        lastFailureDetail: lastFailure?.detail ?? null,
        failuresLast24h,
      };
    }),
  );
}

export async function purgeOldCronRuns(now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - CRON_RUN_RETENTION_DAYS * 86_400_000);
  const { count } = await prisma.cronRun.deleteMany({ where: { startedAt: { lt: cutoff } } });
  return count;
}
