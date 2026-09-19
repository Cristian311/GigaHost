import { NextResponse } from "next/server";
import { withApi } from "@/server/api";
import { rejectUnlessCron } from "@/server/cron-auth";
import { purgeExpiredRateLimits } from "@/server/security/rate-limit";
import { runBillingCycle } from "@/server/services/renewal-service";

/**
 * Renews subscriptions, retries failed charges, suspends and deletes unpaid
 * servers. Schedule it hourly; running it more often is harmless.
 */
async function handle(request: Request) {
  return withApi(async () => {
    const rejected = rejectUnlessCron(request);
    if (rejected) return rejected;
    const report = await runBillingCycle();
    // Housekeeping rides along: expired rate-limit counters are dead weight.
    const purgedRateLimits = await purgeExpiredRateLimits();
    return NextResponse.json({ ...report, purgedRateLimits });
  });
}

// Vercel Cron issues GET requests; POST is there for every other scheduler.
export { handle as GET, handle as POST };
