import {
  Activity,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArchiveX,
  CirclePlay,
  CircleStop,
  PauseCircle,
  PlayCircle,
  RotateCw,
  ServerCog,
  ServerCrash,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ServerEventType } from "@/generated/prisma/client";
import type { ServerEventView } from "@/server/services/event-service";

const ICONS: Record<ServerEventType, LucideIcon> = {
  CREATED: Sparkles,
  INSTALLED: ServerCog,
  STARTED: PlayCircle,
  STOPPED: CircleStop,
  RESTARTED: RotateCw,
  RESIZED: SlidersHorizontal,
  BACKUP_CREATED: Archive,
  BACKUP_RESTORED: ArchiveRestore,
  BACKUP_DELETED: ArchiveX,
  SUSPENDED: PauseCircle,
  UNSUSPENDED: CirclePlay,
  DELETED: ServerCrash,
  ERROR: AlertTriangle,
};

function describeMeta(type: ServerEventType, meta: unknown): string | null {
  if (type !== "RESIZED" || !meta || typeof meta !== "object") return null;
  const m = meta as {
    from?: { ramGb: number; vcpu: number; storageGb: number };
    to?: { ramGb: number; vcpu: number; storageGb: number };
  };
  if (!m.from || !m.to) return null;
  const fmt = (r: { ramGb: number; vcpu: number; storageGb: number }) =>
    `${r.ramGb} GB / ${r.vcpu} vCPU / ${r.storageGb} GB`;
  return `${fmt(m.from)} → ${fmt(m.to)}`;
}

export async function EventsList({ events }: { events: ServerEventView[] }) {
  const [t, format] = await Promise.all([
    getTranslations("dashboard.events"),
    getFormatter(),
  ]);

  return (
    <section className="rounded-2xl border border-white/5 bg-card p-5">
      <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
        <Activity className="size-4" /> {t("title")}
      </h2>

      {events.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ol className="mt-5 space-y-4">
          {events.map((event) => {
            const Icon = ICONS[event.type] ?? Activity;
            const detail = event.message ?? describeMeta(event.type, event.meta);
            return (
              <li key={event.id} className="flex gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t(`types.${event.type}`)}</p>
                  {detail ? (
                    <p className="truncate text-xs text-muted-foreground">{detail}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {format.dateTime(event.createdAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
