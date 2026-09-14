"use client";

import { useTranslations } from "next-intl";
import type { ServerStatus } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

const STYLES: Record<ServerStatus, { dot: string; badge: string; pulse?: boolean }> = {
  RUNNING: { dot: "bg-success", badge: "bg-success/15 text-success", pulse: true },
  STARTING: { dot: "bg-warning", badge: "bg-warning/15 text-warning", pulse: true },
  STOPPING: { dot: "bg-warning", badge: "bg-warning/15 text-warning", pulse: true },
  INSTALLING: { dot: "bg-neon-2", badge: "bg-neon-2/15 text-neon-2", pulse: true },
  PENDING: { dot: "bg-muted-foreground", badge: "bg-muted text-muted-foreground" },
  STOPPED: { dot: "bg-muted-foreground", badge: "bg-muted text-muted-foreground" },
  SUSPENDED: { dot: "bg-destructive", badge: "bg-destructive/15 text-destructive" },
  ERROR: { dot: "bg-destructive", badge: "bg-destructive/15 text-destructive" },
  DELETED: { dot: "bg-muted-foreground", badge: "bg-muted text-muted-foreground" },
};

export function ServerStatusBadge({
  status,
  className,
}: {
  status: ServerStatus;
  className?: string;
}) {
  const t = useTranslations("dashboard.status");
  const style = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium",
        style.badge,
        className,
      )}
    >
      <span className={cn("size-2 rounded-full", style.dot, style.pulse && "animate-pulse-ring")} />
      {t(status)}
    </span>
  );
}
