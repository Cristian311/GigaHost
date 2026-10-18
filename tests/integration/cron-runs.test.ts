import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  CRON_RUN_RETENTION_DAYS,
  cronHealth,
  purgeOldCronRuns,
  recordedRun,
} from "@/server/services/cron-run-service";
import { resetData } from "../setup/db";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms);

/**
 * Cron failures used to reach `console.error` and nowhere else, so a renewal
 * that stopped being billed — or a scheduler that stopped calling at all —
 * would be noticed by a customer before an operator.
 */
describe("cron run history", () => {
  beforeEach(async () => {
    await resetData();
    await prisma.cronRun.deleteMany();
  });

  describe("recording", () => {
    it("stores what a successful run returned", async () => {
      const report = await recordedRun("billing-cycle", async () => ({ renewed: 2, failed: 0 }));

      expect(report).toEqual({ renewed: 2, failed: 0 });
      const run = await prisma.cronRun.findFirstOrThrow();
      expect(run).toMatchObject({ job: "billing-cycle", ok: true });
      expect(run.detail).toContain('"renewed":2');
      expect(run.finishedAt).not.toBeNull();
      expect(run.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("records a failure and still lets it through", async () => {
      await expect(
        recordedRun("due-tasks", async () => {
          throw new Error("the panel is unreachable");
        }),
      ).rejects.toThrow("the panel is unreachable");

      // The caller must still see the error; the point is that it is also kept.
      const run = await prisma.cronRun.findFirstOrThrow();
      expect(run).toMatchObject({ job: "due-tasks", ok: false });
      expect(run.detail).toContain("the panel is unreachable");
      expect(run.finishedAt).not.toBeNull();
    });

    it("keeps one row per run", async () => {
      await recordedRun("due-tasks", async () => ({ ran: 0 }));
      await recordedRun("due-tasks", async () => ({ ran: 1 }));
      expect(await prisma.cronRun.count()).toBe(2);
    });
  });

  describe("health", () => {
    async function run(job: string, at: Date, ok: boolean, detail?: string) {
      return prisma.cronRun.create({
        data: { job, startedAt: at, finishedAt: at, ok, detail, durationMs: 10 },
      });
    }

    it("is healthy after a recent, successful run", async () => {
      await run("billing-cycle", ago(10 * MINUTE), true);
      await run("due-tasks", ago(2 * MINUTE), true);

      const health = await cronHealth();
      expect(health.map((job) => job.state)).toEqual(["ok", "ok"]);
    });

    it("reports a job that has never run", async () => {
      const [billing] = await cronHealth(["billing-cycle"]);
      expect(billing.state).toBe("stale");
      expect(billing.lastRunAt).toBeNull();
    });

    it("reports a scheduler that has stopped calling", async () => {
      // Succeeded, but two days ago: nobody is calling it any more.
      await run("billing-cycle", ago(48 * HOUR), true);

      const [billing] = await cronHealth(["billing-cycle"]);
      expect(billing.state).toBe("stale");
    });

    it("does not call a stalled job healthy just because its last run passed", async () => {
      await run("due-tasks", ago(6 * HOUR), true);
      const [tasks] = await cronHealth(["due-tasks"]);
      expect(tasks.state).toBe("stale");
    });

    it("reports a job that runs but fails", async () => {
      await run("billing-cycle", ago(2 * HOUR), false, "Stripe timed out");
      await run("billing-cycle", ago(10 * MINUTE), false, "Stripe timed out");

      const [billing] = await cronHealth(["billing-cycle"]);
      expect(billing.state).toBe("failing");
      expect(billing.failuresLast24h).toBe(2);
      expect(billing.lastFailureDetail).toBe("Stripe timed out");
    });

    it("ignores failures older than a day", async () => {
      await run("billing-cycle", ago(30 * HOUR), false, "old news");
      await run("billing-cycle", ago(5 * MINUTE), true);

      const [billing] = await cronHealth(["billing-cycle"]);
      expect(billing.state).toBe("ok");
      expect(billing.failuresLast24h).toBe(0);
    });
  });

  describe("pruning", () => {
    it("drops runs past the retention window and keeps the rest", async () => {
      await prisma.cronRun.create({
        data: {
          job: "due-tasks",
          startedAt: ago((CRON_RUN_RETENTION_DAYS + 1) * 24 * HOUR),
          ok: true,
        },
      });
      await prisma.cronRun.create({ data: { job: "due-tasks", startedAt: ago(HOUR), ok: true } });

      expect(await purgeOldCronRuns()).toBe(1);
      expect(await prisma.cronRun.count()).toBe(1);
    });
  });
});
