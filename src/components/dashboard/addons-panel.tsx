"use client";

import { Check, Download, Loader2, PuzzleIcon, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { AddonView } from "@/server/services/addon-service";

const KINDS = ["ALL", "PLUGIN", "MOD", "MODPACK"] as const;
type KindFilter = (typeof KINDS)[number];

function formatSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${(kb / (1024 * 1024)).toFixed(2)} GB`;
}

export function AddonsPanel({ serverId, available }: { serverId: string; available: boolean }) {
  const t = useTranslations("dashboard.addons");
  const router = useRouter();
  const [addons, setAddons] = useState<AddonView[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [kind, setKind] = useState<KindFilter>("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!available) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/servers/${serverId}/addons`, { cache: "no-store" });
        if (!cancelled) setAddons(res.ok ? ((await res.json()) as AddonView[]) : []);
      } catch {
        if (!cancelled) setAddons([]);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [serverId, available, refreshKey]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (addons ?? []).filter(
      (addon) =>
        (kind === "ALL" || addon.kind === kind) &&
        (!needle ||
          addon.name.toLowerCase().includes(needle) ||
          addon.description.toLowerCase().includes(needle)),
    );
  }, [addons, kind, search]);

  async function toggle(addon: AddonView) {
    if (addon.installed && !window.confirm(t("confirmRemove", { name: addon.name }))) return;
    setPending(addon.id);
    try {
      const res = await fetch(`/api/servers/${serverId}/addons/${addon.id}`, {
        method: addon.installed ? "DELETE" : "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        const key = `errors.${body?.error ?? "internal_error"}` as const;
        toast.error(t.has(key) ? t(key) : t("errors.internal_error"));
        return;
      }
      const { restartRequired } = (await res.json()) as { restartRequired: boolean };
      const done = addon.installed ? t("removed", { name: addon.name }) : t("installed", { name: addon.name });
      toast.success(restartRequired ? `${done} ${t("restartRequired")}` : done);
      setRefreshKey((key) => key + 1);
      router.refresh();
    } catch {
      toast.error(t("errors.internal_error"));
    } finally {
      setPending(null);
    }
  }

  if (!available) {
    return (
      <p className="rounded-2xl border border-white/5 bg-card px-5 py-10 text-center text-sm text-muted-foreground">
        {t("unavailable")}
      </p>
    );
  }

  return (
    <section className="rounded-2xl border border-white/5 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
          <PuzzleIcon className="size-4" /> {t("title")}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1">
            {KINDS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  kind === option
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`kinds.${option}`)}
              </button>
            ))}
          </div>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("search")}
            className="h-8 w-44"
          />
        </div>
      </div>

      <div className="mt-5">
        {addons === null ? (
          <div className="h-40 animate-pulse rounded-xl bg-white/[0.04]" />
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {addons.length === 0 ? t("noneForGame") : t("noMatch")}
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {visible.map((addon) => (
              <li
                key={addon.id}
                className={cn(
                  "flex flex-col rounded-xl border p-4",
                  addon.installed ? "border-success/30 bg-success/5" : "border-white/5 bg-white/[0.02]",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {addon.name}
                      {addon.installed ? <Check className="size-4 text-success" /> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {addon.author} · v{addon.version} · {formatSize(addon.sizeKb)}
                    </p>
                  </div>
                  <Badge variant="outline">{t(`kinds.${addon.kind}`)}</Badge>
                </div>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{addon.description}</p>
                <Button
                  size="sm"
                  className="mt-3 self-start"
                  variant={addon.installed ? "outline" : "default"}
                  disabled={pending !== null}
                  onClick={() => toggle(addon)}
                >
                  {pending === addon.id ? (
                    <Loader2 className="animate-spin" />
                  ) : addon.installed ? (
                    <Trash2 data-icon="inline-start" />
                  ) : (
                    <Download data-icon="inline-start" />
                  )}
                  {addon.installed ? t("remove") : t("install")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
