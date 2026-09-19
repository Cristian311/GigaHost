import { NextResponse } from "next/server";
import { withApi } from "@/server/api";
import { rejectUnlessCron } from "@/server/cron-auth";
import { runBillingCycle } from "@/server/services/renewal-service";

/**
 * Renews subscriptions, retries failed charges, suspends and deletes unpaid
 * servers. Schedule it hourly; running it more often is harmless.
 */
async function handle(request: Request) {
  return withApi(async () => {
    const rejected = rejectUnlessCron(request);
    if (rejected) return rejected;
    return NextResponse.json(await runBillingCycle());
  });
}

// Vercel Cron issues GET requests; POST is there for every other scheduler.
export { handle as GET, handle as POST };
