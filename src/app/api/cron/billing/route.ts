import { NextResponse } from "next/server";
import { retryFailedEmails } from "@/server/mail/mailer";
import { withApi } from "@/server/api";
import { rejectUnlessCron } from "@/server/cron-auth";
import { purgeExpiredRateLimits } from "@/server/security/rate-limit";
import { purgeOldCronRuns, recordedRun } from "@/server/services/cron-run-service";
import { purgeExpiredJobLocks } from "@/server/services/job-lock";
import { runBillingCycle } from "@/server/services/renewal-service";
import { purgeExpiredData } from "@/server/services/retention-service";

/**
 * Renews subscriptions, retries failed charges, suspends and deletes unpaid
 * servers. Schedule it hourly; running it more often is harmless, and two runs
 * that overlap are safe because the cycle takes a lease.
 */
async function handle(request: Request) {
  return withApi(request, async () => {
    const rejected = rejectUnlessCron(request);
    if (rejected) return rejected;

    // Recorded, so a failed run is visible in the admin area rather than only
    // in whatever captured stdout.
    const report = await recordedRun("billing-cycle", () => runBillingCycle());

    // Housekeeping rides along. Each part is independent of the billing run and
    // of the others, so one failing must not lose the rest of the report.
    const [rateLimits, jobLocks, retention, mail, cronRuns] = await Promise.allSettled([
      purgeExpiredRateLimits(),
      purgeExpiredJobLocks(),
      purgeExpiredData(),
      retryFailedEmails(),
      purgeOldCronRuns(),
    ]);

    const settled = <T>(result: PromiseSettledResult<T>, label: string): T | { error: string } => {
      if (result.status === "fulfilled") return result.value;
      console.error(`[cron] ${label} failed`, result.reason);
      return { error: label };
    };

    return NextResponse.json({
      ...report,
      housekeeping: {
        purgedRateLimits: settled(rateLimits, "rate-limits"),
        purgedJobLocks: settled(jobLocks, "job-locks"),
        retention: settled(retention, "retention"),
        mail: settled(mail, "mail-retry"),
        purgedCronRuns: settled(cronRuns, "cron-runs"),
      },
    });
  });
}

// Vercel Cron issues GET requests; POST is there for every other scheduler.
export { handle as GET, handle as POST };
