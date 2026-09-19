import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, Cpu, HardDrive, MemoryStick } from "lucide-react";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { CopyButton } from "@/components/copy-button";
import { AddonsPanel } from "@/components/dashboard/addons-panel";
import { BackupsPanel } from "@/components/dashboard/backups-panel";
import { EventsList } from "@/components/dashboard/events-list";
import { FilesPanel } from "@/components/dashboard/files-panel";
import { LivePanel } from "@/components/dashboard/live-panel";
import { PlayersPanel } from "@/components/dashboard/players-panel";
import { PowerControls } from "@/components/dashboard/power-controls";
import { ResizeDialog } from "@/components/dashboard/resize-dialog";
import { ServerActionsMenu } from "@/components/dashboard/server-actions-menu";
import { ServerStatusBadge } from "@/components/dashboard/server-status-badge";
import { ServerTabs } from "@/components/dashboard/server-tabs";
import { SubscriptionActions } from "@/components/dashboard/subscription-actions";
import { TasksPanel } from "@/components/dashboard/tasks-panel";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/pricing/calculate-price";
import { requireUser } from "@/server/auth-guard";
import { AppError } from "@/server/errors";
import { getServerEvents, getServerForUser } from "@/server/services/server-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.server");
  return { title: t("overview"), robots: { index: false } };
}

export default async function ServerPage({ params }: PageProps<"/[locale]/dashboard/servers/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser();

  let server;
  try {
    server = await getServerForUser(id, user.id);
  } catch (error) {
    if (error instanceof AppError && error.code === "server_not_found") notFound();
    throw error;
  }

  const [t, tb, tc, tr, format, currentLocale, events] = await Promise.all([
    getTranslations("dashboard.server"),
    getTranslations("configure"),
    getTranslations("billing"),
    getTranslations("dashboard.resize"),
    getFormatter(),
    getLocale(),
    getServerEvents(id, user.id),
  ]);

  const address = server.ip ? `${server.ip}:${server.port}` : null;
  const sub = server.subscription;
  const resizable = server.status === "STOPPED" || server.status === "RUNNING";
  // Files and add-ons exist once the server is installed, and are closed while
  // it is suspended.
  const panelAvailable = !["PENDING", "INSTALLING", "SUSPENDED"].includes(server.status);

  const overview = (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <InfoTile icon={<MemoryStick className="size-4" />} label={tb("ram")} value={`${server.ramGb} GB`} />
        <InfoTile icon={<Cpu className="size-4" />} label={tb("cpu")} value={`${server.vcpu} vCPU`} />
        <InfoTile
          icon={<HardDrive className="size-4" />}
          label={tb("storage")}
          value={`${server.storageGb} GB NVMe`}
        />
      </div>

      <div className="mt-6">
        <LivePanel serverId={server.id} status={server.status} />
      </div>

      {sub ? (
        <section className="mt-6 rounded-2xl border border-white/5 bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase">
              {t("subscription")}
            </h2>
            <SubscriptionActions
              subscriptionId={sub.id}
              cancelAtPeriodEnd={sub.cancelAtPeriodEnd}
              pastDue={sub.status === "PAST_DUE"}
            />
          </div>
          <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">{tc("status")}</dt>
              <dd className="font-medium">{tc(`statuses.${sub.status}`)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("period")}</dt>
              <dd className="font-medium">{tb(`periods.${sub.billingPeriod}`)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{tc("amount")}</dt>
              <dd className="font-medium">
                {formatMoney(sub.amountCents, sub.currency, currentLocale)}
                {sub.creditCents > 0 ? (
                  <span className="ml-1 text-xs text-success">
                    −{formatMoney(sub.creditCents, sub.currency, currentLocale)}
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{tc("nextRenewal")}</dt>
              <dd className="font-medium">
                {sub.cancelAtPeriodEnd
                  ? t("endsOn", { date: format.dateTime(sub.currentPeriodEnd, { dateStyle: "medium" }) })
                  : t("renews", { date: format.dateTime(sub.currentPeriodEnd, { dateStyle: "medium" }) })}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
    </>
  );

  return (
    <>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("overview")}
      </Link>

      <div className="mt-4 overflow-hidden rounded-3xl border border-white/5 bg-card">
        <div className="relative h-36">
          <Image src={server.game.image} alt="" fill unoptimized className="object-cover" sizes="1200px" />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/70 to-card/10" />
        </div>
        <div className="-mt-10 flex flex-col gap-5 p-6 md:flex-row md:items-end md:justify-between">
          <div className="relative">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold">{server.name}</h1>
              <ServerStatusBadge status={server.status} />
            </div>
            <p className="mt-1 text-muted-foreground">
              {server.game.name}
              {server.gameVersion ? ` · ${server.gameVersion}` : ""} · {server.region.flag}{" "}
              {server.region.name}
            </p>
            <div className="mt-3 flex items-center gap-1">
              <code className="rounded-md bg-black/40 px-2.5 py-1 font-mono text-sm">
                {address ?? t("notAssigned")}
              </code>
              {address ? <CopyButton value={address} /> : null}
            </div>
          </div>
          <div className="relative flex flex-wrap items-center gap-2">
            <PowerControls serverId={server.id} status={server.status} />
            <ResizeDialog
              serverId={server.id}
              current={{
                ramGb: server.ramGb,
                vcpu: server.vcpu,
                storageGb: server.storageGb,
              }}
              minimums={{
                ramGb: server.game.minRamGb,
                vcpu: server.game.minCpu,
                storageGb: server.game.minStorageGb,
              }}
              disabled={!resizable}
            />
            <ServerActionsMenu serverId={server.id} name={server.name} />
          </div>
        </div>
      </div>

      {server.status === "INSTALLING" ? (
        <p className="mt-4 rounded-xl border border-neon-2/30 bg-neon-2/10 px-4 py-3 text-sm text-neon-2">
          {t("installingHint")}
        </p>
      ) : null}
      {!resizable && server.status !== "INSTALLING" ? (
        <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-muted-foreground">
          {tr("onlyWhenStable")}
        </p>
      ) : null}

      <ServerTabs
        panels={{
          overview,
          files: <FilesPanel serverId={server.id} available={panelAvailable} />,
          players: <PlayersPanel serverId={server.id} running={server.status === "RUNNING"} />,
          addons: <AddonsPanel serverId={server.id} available={panelAvailable} />,
          tasks: <TasksPanel serverId={server.id} />,
          backups: <BackupsPanel serverId={server.id} />,
          activity: <EventsList events={events} />,
        }}
      />
    </>
  );
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-card p-4">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
        {icon}
      </span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold">{value}</p>
      </div>
    </div>
  );
}
