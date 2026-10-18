"use client";

import { Loader2, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { runBillingCycleAction } from "@/server/actions/admin";
import type { BillingCycleReport } from "@/server/services/renewal-service";

export function RunBillingButton() {
  const t = useTranslations("admin.billing");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [report, setReport] = useState<BillingCycleReport | null>(null);

  function run() {
    startTransition(async () => {
      const result = await runBillingCycleAction();
      if (!result.ok) {
        toast.error(tc("error"));
        return;
      }
      setReport(result.data);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">{t("runHint")}</p>
        <Button onClick={run} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Play data-icon="inline-start" />}
          {pending ? t("running") : t("run")}
        </Button>
      </div>
      {report ? (
        <p className="mt-4 rounded-lg bg-white/[0.04] px-3 py-2 font-mono text-xs">
          {report.skipped
            ? t("reportSkipped")
            : t("report", {
                renewed: report.renewed,
                failed: report.failed,
                cancelled: report.cancelled,
                suspended: report.suspended,
                deleted: report.deleted,
                errors: report.errors,
              })}
        </p>
      ) : null}
    </div>
  );
}
