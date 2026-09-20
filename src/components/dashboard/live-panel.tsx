"use client";

import { Activity, Cpu, HardDrive, MemoryStick, Terminal, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import type { ServerStatus } from "@/generated/prisma/client";
import { Progress } from "@/components/ui/progress";
import { useRouter } from "@/i18n/navigation";
import { formatUptime } from "@/lib/dates";
import type { ConsoleLine, ResourceUsage } from "@/server/providers/types";
import { cn } from "@/lib/utils";
import { ConsoleInput } from "./console-input";
import { useServerSocket } from "./use-server-socket";

const TRANSITIONAL: ServerStatus[] = ["PENDING", "INSTALLING", "STARTING", "STOPPING"];

type UsagePayload = { status: ServerStatus; usage: ResourceUsage };
type ConsolePayload = { status: ServerStatus; lines: ConsoleLine[] };

/**
 * Usage is polled; the console streams over the node's websocket when the
 * provider offers one and is polled otherwise (mock). Whenever the reported
 * status differs from the server-rendered one the page is refreshed so the
 * header and power controls update too.
 */
export function LivePanel({ serverId, status }: { serverId: string; status: ServerStatus }) {
  const t = useTranslations("dashboard.server");
  const router = useRouter();
  const [usage, setUsage] = useState<ResourceUsage | null>(null);
  const [polledLines, setPolledLines] = useState<ConsoleLine[]>([]);
  // Bumped after a command is sent, so its answer shows up without waiting for
  // the next poll. Only matters while polling; a live socket pushes it anyway.
  const [refreshKey, setRefreshKey] = useState(0);
  const consoleRef = useRef<HTMLDivElement>(null);

  const socket = useServerSocket(serverId, status !== "SUSPENDED", () => router.refresh());
  const streaming = socket.state !== "unavailable";
  const lines = streaming ? socket.lines : polledLines;

  useEffect(() => {
    let cancelled = false;
    const interval = TRANSITIONAL.includes(status) ? 2000 : 5000;

    async function tick() {
      try {
        const [usageRes, consoleRes] = await Promise.all([
          fetch(`/api/servers/${serverId}/usage`, { cache: "no-store" }),
          streaming
            ? null
            : fetch(`/api/servers/${serverId}/console?limit=80`, { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (usageRes.ok) {
          const data = (await usageRes.json()) as UsagePayload;
          setUsage(data.usage);
          if (data.status !== status) router.refresh();
        }
        if (consoleRes?.ok) {
          const data = (await consoleRes.json()) as ConsolePayload;
          setPolledLines(data.lines);
        }
      } catch {
        // Network hiccup: keep the last known values.
      }
    }

    tick();
    const id = setInterval(tick, interval);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [serverId, status, router, streaming, refreshKey]);

  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const ramPct = usage ? Math.round((usage.ramUsedMb / usage.ramTotalMb) * 100) : 0;
  const diskPct = usage ? Math.round((usage.diskUsedMb / usage.diskTotalMb) * 100) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <section className="rounded-2xl border border-white/5 bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase">
          <Activity className="size-4" /> {t("usage")}
        </h2>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Stat
            icon={<Cpu className="size-4" />}
            label={t("cpu")}
            value={usage ? `${usage.cpuPct}%` : "—"}
            pct={usage?.cpuPct ?? 0}
          />
          <Stat
            icon={<MemoryStick className="size-4" />}
            label={t("ram")}
            value={usage ? `${(usage.ramUsedMb / 1024).toFixed(1)} / ${usage.ramTotalMb / 1024} GB` : "—"}
            pct={ramPct}
          />
          <Stat
            icon={<HardDrive className="size-4" />}
            label={t("disk")}
            value={usage ? `${(usage.diskUsedMb / 1024).toFixed(1)} / ${usage.diskTotalMb / 1024} GB` : "—"}
            pct={diskPct}
          />
          <Stat
            icon={<Users className="size-4" />}
            label={t("players")}
            value={usage ? String(usage.players) : "—"}
            footer={usage ? `${t("uptime")}: ${formatUptime(usage.uptimeSec)}` : undefined}
          />
        </div>

        <div className="mt-4 h-36 rounded-xl bg-black/30 p-2">
          {usage ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={usage.history} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis domain={[0, 100]} hide />
                <Tooltip
                  cursor={{ stroke: "var(--border)" }}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                  labelFormatter={() => ""}
                  formatter={(value) => [`${value}%`, "CPU"]}
                />
                <Area
                  type="monotone"
                  dataKey="cpuPct"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#cpuFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full animate-pulse rounded-lg bg-white/[0.04]" />
          )}
        </div>
      </section>

      <section className="flex flex-col rounded-2xl border border-white/5 bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase">
          <Terminal className="size-4" /> {t("console")}
          {streaming ? (
            <span
              className={cn(
                "ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium normal-case",
                socket.state === "live" ? "text-success" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  socket.state === "live" ? "bg-success" : "animate-pulse bg-muted-foreground",
                )}
              />
              {socket.state === "live" ? t("consoleLive") : t("consoleConnecting")}
            </span>
          ) : null}
        </h2>
        <div
          ref={consoleRef}
          className="scrollbar-thin mt-4 h-72 flex-1 overflow-y-auto rounded-xl bg-black/50 p-3 font-mono text-[11.5px] leading-relaxed"
        >
          {lines.length === 0 ? (
            <p className="text-muted-foreground">{t("consoleEmpty")}</p>
          ) : streaming ? (
            // Real server output already carries its own timestamp and level.
            lines.map((line, index) => (
              <p
                key={`${line.ts}-${index}`}
                className={cn(
                  "whitespace-pre-wrap",
                  line.level === "info" && "text-foreground/90",
                  line.level === "warn" && "text-warning",
                  line.level === "error" && "text-destructive",
                )}
              >
                {line.text}
              </p>
            ))
          ) : (
            lines.map((line, index) => (
              <p key={`${line.ts}-${index}`} className="whitespace-pre-wrap">
                <span className="text-muted-foreground">
                  [{new Date(line.ts).toLocaleTimeString([], { hour12: false })}]
                </span>{" "}
                <span
                  className={cn(
                    line.level === "info" && "text-success",
                    line.level === "warn" && "text-warning",
                    line.level === "error" && "text-destructive",
                  )}
                >
                  [{line.level.toUpperCase()}]
                </span>{" "}
                <span className="text-foreground/90">{line.text}</span>
              </p>
            ))
          )}
        </div>
        {/* Commands go over the API route for both providers: it also handles
            "stop" and "restart" as power actions. A live socket echoes the
            output back on its own. */}
        <ConsoleInput
          serverId={serverId}
          disabled={status !== "RUNNING"}
          onSent={() => setRefreshKey((key) => key + 1)}
        />
      </section>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  pct,
  footer,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  pct?: number;
  footer?: string;
}) {
  return (
    <div className="rounded-xl bg-white/[0.04] p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
      {pct !== undefined ? (
        <Progress value={pct} className="mt-2 h-1.5" />
      ) : footer ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{footer}</p>
      ) : null}
    </div>
  );
}
