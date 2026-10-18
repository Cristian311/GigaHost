import { CheckCircle2, CircleAlert, CircleHelp, Clock } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { cronHealth } from "@/server/services/cron-run-service";

const ICONS = {
  ok: CheckCircle2,
  failing: CircleAlert,
  stale: CircleHelp,
} as const;

/**
 * Answers the two questions an operator actually has: is the scheduler calling
 * the jobs at all, and is what it calls working? Both used to be invisible — a
 * failed renewal reached the logs and nothing else.
 */
export async function CronHealth() {
  const [t, format, jobs] = await Promise.all([
    getTranslations("admin.cron"),
    getFormatter(),
    cronHealth(),
  ]);

  return (
    <section className="rounded-2xl border border-white/5 bg-card p-5">
      <h2 className="mb-1 text-lg font-semibold">{t("title")}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{t("hint")}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {jobs.map((job) => {
          const Icon = ICONS[job.state];
          return (
            <div key={job.job} className="rounded-xl border border-white/5 bg-background/40 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-sm">{job.job}</p>
                <Badge variant={job.state === "ok" ? "outline" : "destructive"}>
                  <Icon data-icon="inline-start" />
                  {t(job.state)}
                </Badge>
              </div>

              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" />
                {job.lastRunAt
                  ? t("lastRun", {
                      when: format.relativeTime(job.lastRunAt),
                      duration: job.lastDurationMs ?? 0,
                    })
                  : t("never")}
              </p>

              {job.failuresLast24h > 0 ? (
                <p className="mt-1 text-xs text-destructive">
                  {t("failures", { count: job.failuresLast24h })}
                </p>
              ) : null}

              {job.lastFailureDetail ? (
                <p
                  className="mt-1 truncate text-xs text-destructive/80"
                  title={job.lastFailureDetail}
                >
                  {job.lastFailureDetail}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
