import { NextResponse } from "next/server";
import { withApi } from "@/server/api";
import { rejectUnlessCron } from "@/server/cron-auth";
import { recordedRun } from "@/server/services/cron-run-service";
import { runDueTasks } from "@/server/services/task-service";

/**
 * Runs customers' scheduled restarts, backups and commands. Schedule it every
 * few minutes: a task fires on the first run after its time has come.
 */
async function handle(request: Request) {
  return withApi(request, async () => {
    const rejected = rejectUnlessCron(request);
    if (rejected) return rejected;
    return NextResponse.json(await recordedRun("due-tasks", () => runDueTasks()));
  });
}

export { handle as GET, handle as POST };
