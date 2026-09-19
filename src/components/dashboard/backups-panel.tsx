"use client";

import { Archive, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { MAX_BACKUPS_PER_SERVER } from "@/lib/constants";
import {
  createBackupAction,
  deleteBackupAction,
  restoreBackupAction,
} from "@/server/actions/servers";
import { cn } from "@/lib/utils";

type BackupRow = {
  id: string;
  name: string;
  sizeMb: number;
  status: "CREATING" | "COMPLETED" | "RESTORING" | "FAILED";
  createdAt: string;
};

const BUSY: BackupRow["status"][] = ["CREATING", "RESTORING"];

export function BackupsPanel({ serverId }: { serverId: string }) {
  const t = useTranslations("dashboard.backups");
  const format = useFormatter();
  const router = useRouter();
  const [backups, setBackups] = useState<BackupRow[] | null>(null);
  const [name, setName] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [pending, startTransition] = useTransition();

  const busy = backups?.some((b) => BUSY.includes(b.status)) ?? false;

  // Loads the list, then keeps polling only while a backup is being created or
  // restored (the mock backend settles those after a few seconds).
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/servers/${serverId}/backups`, { cache: "no-store" });
        if (!cancelled && res.ok) setBackups((await res.json()) as BackupRow[]);
      } catch {
        // keep the previous list on a network hiccup
      }
    }

    load();
    const id = busy ? setInterval(load, 3000) : undefined;
    return () => {
      cancelled = true;
      if (id) clearInterval(id);
    };
  }, [serverId, busy, refreshKey]);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        const key = `errors.${result.error}` as const;
        toast.error(t.has(key) ? t(key) : t("errors.internal_error"));
        return;
      }
      setRefreshKey((k) => k + 1);
      router.refresh();
    });
  }

  const atLimit = (backups?.length ?? 0) >= MAX_BACKUPS_PER_SERVER;

  return (
    <section className="rounded-2xl border border-white/5 bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
            <Archive className="size-4" /> {t("title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("description", { max: MAX_BACKUPS_PER_SERVER })}
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            maxLength={60}
            className="w-52"
          />
          <Button
            disabled={pending || atLimit}
            onClick={() =>
              run(async () => {
                const result = await createBackupAction(serverId, name.trim() || undefined);
                if (result.ok) setName("");
                return result;
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            {t("create")}
          </Button>
        </div>
      </div>

      <div className="mt-5">
        {backups === null ? (
          <div className="h-20 animate-pulse rounded-xl bg-white/[0.04]" />
        ) : backups.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {backups.map((backup) => {
              const busy = BUSY.includes(backup.status);
              return (
                <li key={backup.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{backup.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(backup.sizeMb / 1024).toFixed(2)} GB ·{" "}
                      {format.dateTime(new Date(backup.createdAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <Badge
                    variant={backup.status === "COMPLETED" ? "default" : "outline"}
                    className={cn(busy && "animate-pulse")}
                  >
                    {t(`statuses.${backup.status}`)}
                  </Badge>
                  <div className="flex gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("restore")}
                      disabled={pending || backup.status !== "COMPLETED"}
                      onClick={() => {
                        if (!window.confirm(t("confirmRestore"))) return;
                        run(() => restoreBackupAction(serverId, backup.id));
                      }}
                    >
                      <RotateCcw />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("delete")}
                      disabled={pending || backup.status === "RESTORING"}
                      onClick={() => {
                        if (!window.confirm(t("confirmDelete"))) return;
                        run(() => deleteBackupAction(serverId, backup.id));
                      }}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
