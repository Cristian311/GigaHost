"use client";

import { Loader2, Play, RotateCw, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import type { ServerStatus } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { PowerAction } from "@/lib/validation/server";
import { powerAction } from "@/server/actions/servers";

export function PowerControls({ serverId, status }: { serverId: string; status: ServerStatus }) {
  const t = useTranslations("dashboard.server");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const canStart = status === "STOPPED" || status === "ERROR";
  const canStop = status === "RUNNING" || status === "STARTING";
  const canRestart = status === "RUNNING";

  function run(action: PowerAction) {
    startTransition(async () => {
      const result = await powerAction(serverId, action);
      if (!result.ok) {
        const key = `errors.${result.error}` as const;
        toast.error(t.has(key) ? t(key) : t("errors.internal_error"));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        onClick={() => run("start")}
        disabled={!canStart || pending}
        className="bg-success text-primary-foreground hover:bg-success/80"
      >
        {pending ? <Loader2 className="animate-spin" /> : <Play data-icon="inline-start" />}
        {t("start")}
      </Button>
      <Button variant="outline" onClick={() => run("restart")} disabled={!canRestart || pending}>
        <RotateCw data-icon="inline-start" /> {t("restart")}
      </Button>
      <Button variant="destructive" onClick={() => run("stop")} disabled={!canStop || pending}>
        <Square data-icon="inline-start" /> {t("stop")}
      </Button>
    </div>
  );
}
