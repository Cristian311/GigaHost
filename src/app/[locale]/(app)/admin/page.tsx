import {
  Activity,
  CalendarClock,
  PlugZap,
  Server,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import type { ServerStatus } from "@/generated/prisma/client";
import { ServerStatusBadge } from "@/components/dashboard/server-status-badge";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { BILLING_STATUS_VARIANT } from "@/lib/billing-status";
import { formatMoney } from "@/lib/pricing/calculate-price";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/server/auth-guard";
import { getAdminOverview, getProviderHealth } from "@/server/services/admin-service";
import { getActivePricing } from "@/server/services/pricing-service";

const STATUS_ORDER: ServerStatus[] = [
  "RUNNING",
  "STARTING",
  "STOPPING",
  "INSTALLING",
  "STOPPED",
  "PENDING",
  "SUSPENDED",
  "ERROR",
];

export default async function AdminOverviewPage({ params }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const [t, to, tb, tp, format, currentLocale, overview, pricing, health] = await Promise.all([
    getTranslations("admin.stats"),
    getTranslations("admin.overview"),
    getTranslations("billing"),
    getTranslations("admin.provider"),
    getFormatter(),
    getLocale(),
    getAdminOverview(),
    getActivePricing(),
    getProviderHealth(),
  ]);

  const money = (cents: number, currency = pricing.currency) =>
    formatMoney(cents, currency, currentLocale);

  const tiles = [
    { icon: Users, label: t("users"), value: String(overview.users) },
    { icon: Server, label: t("servers"), value: String(overview.servers) },
    { icon: Activity, label: t("running"), value: String(overview.runningServers) },
    { icon: ShoppingCart, label: t("orders"), value: String(overview.orders) },
    { icon: TrendingUp, label: t("revenue30d"), value: money(overview.revenue30dCents) },
    { icon: Wallet, label: t("revenue"), value: money(overview.revenueCents) },
    { icon: CalendarClock, label: t("renewalsDue"), value: String(overview.renewalsDue) },
  ];

  const statusRows = STATUS_ORDER.filter((s) => overview.serversByStatus[s]);
  const maxCount = Math.max(1, ...statusRows.map((s) => overview.serversByStatus[s] ?? 0));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/5 bg-card/60 px-4 py-2.5 text-sm">
        <PlugZap className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground">{tp("label")}:</span>
        {health.kind === "mock" ? (
          <span className="font-medium">{tp("mock")}</span>
        ) : (
          <>
            <span className="font-medium">Pterodactyl</span>
            <code className="text-xs text-muted-foreground">{health.url}</code>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium",
                health.ok ? "text-success" : "text-destructive",
              )}
            >
              <span className={cn("size-2 rounded-full", health.ok ? "bg-success" : "bg-destructive")} />
              {health.ok ? tp("connected") : tp("unreachable")}
            </span>
            {!health.ok && health.error ? (
              <span className="w-full truncate text-xs text-destructive">{health.error}</span>
            ) : null}
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-white/5 bg-card p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <tile.icon className="size-4" /> {tile.label}
            </div>
            <p className="mt-2 font-heading text-3xl font-bold tabular-nums">{tile.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title={to("serversByStatus")} href="/admin/servers" linkLabel={to("viewAll")}>
          {statusRows.length === 0 ? (
            <Empty text={to("empty")} />
          ) : (
            <ul className="space-y-3 p-5">
              {statusRows.map((status) => {
                const count = overview.serversByStatus[status] ?? 0;
                return (
                  <li key={status}>
                    <Link
                      href={`/admin/servers?status=${status}`}
                      className="flex items-center justify-between gap-3 hover:opacity-80"
                    >
                      <ServerStatusBadge status={status} />
                      <span className="font-semibold tabular-nums">{count}</span>
                    </Link>
                    <div className="mt-1.5 h-1.5 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title={to("recentOrders")} href="/admin/billing" linkLabel={to("viewAll")}>
          {overview.recentOrders.length === 0 ? (
            <Empty text={to("empty")} />
          ) : (
            <ul className="divide-y divide-white/5">
              {overview.recentOrders.map((order) => (
                <li key={order.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{order.server?.name ?? "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {order.user.email} · {format.dateTime(order.createdAt, { dateStyle: "medium" })}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="tabular-nums">{money(order.totalCents, order.currency)}</span>
                    <Badge variant={BILLING_STATUS_VARIANT[order.status]}>
                      {tb(`statuses.${order.status}`)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={to("recentUsers")} href="/admin/users" linkLabel={to("viewAll")}>
          {overview.recentUsers.length === 0 ? (
            <Empty text={to("empty")} />
          ) : (
            <ul className="divide-y divide-white/5">
              {overview.recentUsers.map((user) => (
                <li key={user.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{user.name ?? user.email}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {format.dateTime(user.createdAt, { dateStyle: "medium" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

function Panel({
  title,
  href,
  linkLabel,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/5 bg-card">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase">{title}</h2>
        <Link href={href} className="text-xs text-primary hover:underline">
          {linkLabel}
        </Link>
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-5 py-8 text-center text-sm text-muted-foreground">{text}</p>;
}
