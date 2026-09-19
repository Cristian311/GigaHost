"use client";

import { Ban, Loader2, ShieldPlus, UserX, Users } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PlayerList } from "@/server/providers/types";

type Action = "kick" | "ban" | "op";

export function PlayersPanel({ serverId, running }: { serverId: string; running: boolean }) {
  const t = useTranslations("dashboard.players");
  const format = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  const [list, setList] = useState<PlayerList | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!running) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/servers/${serverId}/players`, { cache: "no-store" });
        if (!cancelled && res.ok) setList((await res.json()) as PlayerList);
      } catch {
        // keep the previous list on a network hiccup
      }
    }

    load();
    const id = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [serverId, running]);

  async function moderate(action: Action, player: string) {
    if (action !== "op" && !window.confirm(t(`confirm.${action}`, { player }))) return;
    setPending(`${action}:${player}`);
    try {
      const res = await fetch(`/api/servers/${serverId}/players`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, player }),
      });
      if (!res.ok) {
        toast.error(t("error"));
        return;
      }
      setList((await res.json()) as PlayerList);
      toast.success(t(`done.${action}`, { player }));
    } catch {
      toast.error(t("error"));
    } finally {
      setPending(null);
    }
  }

  if (!running) {
    return (
      <p className="rounded-2xl border border-white/5 bg-card px-5 py-10 text-center text-sm text-muted-foreground">
        {t("offline")}
      </p>
    );
  }

  return (
    <section className="rounded-2xl border border-white/5 bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
          <Users className="size-4" /> {t("title")}
        </h2>
        <span className="text-sm tabular-nums text-muted-foreground">
          {list ? t("count", { online: list.online, max: list.max }) : "—"}
        </span>
      </div>

      <div className="mt-4">
        {list === null ? (
          <div className="h-24 animate-pulse rounded-xl bg-white/[0.04]" />
        ) : list.players.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {list.players.map((player) => (
              <li key={player.name} className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 font-heading text-sm font-bold text-primary">
                  {player.name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{player.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("joined", { when: format.relativeTime(new Date(player.joinedAt), now) })} ·{" "}
                    {player.pingMs} ms
                  </p>
                </div>
                <div className="flex gap-1">
                  {(
                    [
                      ["op", ShieldPlus],
                      ["kick", UserX],
                      ["ban", Ban],
                    ] as const
                  ).map(([action, Icon]) => (
                    <Button
                      key={action}
                      size="sm"
                      variant="ghost"
                      disabled={pending !== null}
                      onClick={() => moderate(action, player.name)}
                    >
                      {pending === `${action}:${player.name}` ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Icon
                          data-icon="inline-start"
                          className={action === "op" ? undefined : "text-destructive"}
                        />
                      )}
                      {t(`actions.${action}`)}
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
