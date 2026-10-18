import { AlertTriangle, Repeat, Wallet } from "lucide-react";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { CronHealth } from "@/components/admin/cron-health";
import { RunBillingButton } from "@/components/admin/run-billing-button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { BILLING_STATUS_VARIANT } from "@/lib/billing-status";
import { formatMoney } from "@/lib/pricing/calculate-price";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/server/auth-guard";
import {
  listAllInvoices,
  listAllOrders,
  listAllSubscriptions,
} from "@/server/services/admin-service";
import { getActivePricing } from "@/server/services/pricing-service";
import { getBillingOverview } from "@/server/services/renewal-service";

const TABS = ["orders", "invoices", "subscriptions"] as const;
type Tab = (typeof TABS)[number];

const LIST_LIMIT = 200;

/**
 * Two halves: the dunning dashboard on top (what needs attention right now and
 * the button that runs the billing cycle), and the ledger below (every order,
 * invoice and subscription).
 */
export default async function AdminBillingPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/billing">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();

  const { tab: rawTab } = await searchParams;
  const tab: Tab = TABS.find((x) => x === rawTab) ?? "orders";

  const [t, ta, tp, format, currentLocale, overview, pricing] = await Promise.all([
    getTranslations("billing"),
    getTranslations("admin.billing"),
    getTranslations("configure.periods"),
    getFormatter(),
    getLocale(),
    getBillingOverview(),
    getActivePricing(),
  ]);

  const date = (d: Date) => format.dateTime(d, { dateStyle: "medium" });
  const money = (cents: number, currency: string) => formatMoney(cents, currency, currentLocale);
  const status = (value: string) => (
    <Badge variant={BILLING_STATUS_VARIANT[value]}>{t(`statuses.${value}`)}</Badge>
  );

  const tiles = [
    { icon: Repeat, label: ta("activeSubscriptions"), value: String(overview.activeCount) },
    {
      icon: Wallet,
      label: ta("mrr"),
      value: money(overview.monthlyRecurringCents, pricing.currency),
    },
    { icon: AlertTriangle, label: ta("pastDueCount"), value: String(overview.pastDue.length) },
  ];

  let rowCount = 0;
  let table: React.ReactNode;

  if (tab === "orders") {
    const orders = await listAllOrders();
    rowCount = orders.length;
    table = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("date")}</TableHead>
            <TableHead>{ta("customer")}</TableHead>
            <TableHead>{t("server")}</TableHead>
            <TableHead>{t("period")}</TableHead>
            <TableHead>{t("amount")}</TableHead>
            <TableHead>{t("status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell>{date(order.createdAt)}</TableCell>
              <TableCell>{order.user.email}</TableCell>
              <TableCell>{order.server?.name ?? "—"}</TableCell>
              <TableCell>{tp(order.billingPeriod)}</TableCell>
              <TableCell className="tabular-nums">{money(order.totalCents, order.currency)}</TableCell>
              <TableCell>{status(order.status)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  } else if (tab === "invoices") {
    const invoices = await listAllInvoices();
    rowCount = invoices.length;
    table = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("invoiceNumber")}</TableHead>
            <TableHead>{t("date")}</TableHead>
            <TableHead>{ta("customer")}</TableHead>
            <TableHead>{t("amount")}</TableHead>
            <TableHead>{t("status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((inv) => (
            <TableRow key={inv.id}>
              <TableCell className="font-mono">{inv.number}</TableCell>
              <TableCell>{date(inv.issuedAt)}</TableCell>
              <TableCell>{inv.user.email}</TableCell>
              <TableCell className="tabular-nums">{money(inv.amountCents, inv.currency)}</TableCell>
              <TableCell>{status(inv.status)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  } else {
    const subscriptions = await listAllSubscriptions();
    rowCount = subscriptions.length;
    table = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("server")}</TableHead>
            <TableHead>{ta("customer")}</TableHead>
            <TableHead>{t("period")}</TableHead>
            <TableHead>{t("amount")}</TableHead>
            <TableHead>{t("nextRenewal")}</TableHead>
            <TableHead>{t("status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subscriptions.map((sub) => (
            <TableRow key={sub.id}>
              <TableCell>
                <p className="font-medium">{sub.server.name}</p>
                <p className="text-xs text-muted-foreground">{sub.server.game.name}</p>
              </TableCell>
              <TableCell>{sub.user.email}</TableCell>
              <TableCell>{tp(sub.billingPeriod)}</TableCell>
              <TableCell className="tabular-nums">{money(sub.amountCents, sub.currency)}</TableCell>
              <TableCell>
                {date(sub.currentPeriodEnd)}
                {sub.cancelAtPeriodEnd ? (
                  <p className="text-xs text-warning">{t("cancelScheduled")}</p>
                ) : null}
              </TableCell>
              <TableCell>{status(sub.status)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-white/5 bg-card p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <tile.icon className="size-4" /> {tile.label}
            </div>
            <p className="mt-2 font-heading text-3xl font-bold tabular-nums">{tile.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-6">
        <CronHealth />
      </div>

      <RunBillingButton />

      <Section title={ta("pastDue")}>
        {overview.pastDue.length === 0 ? (
          <Empty text={ta("empty")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ta("customer")}</TableHead>
                <TableHead>{ta("server")}</TableHead>
                <TableHead>{ta("amount")}</TableHead>
                <TableHead>{ta("unpaidSince")}</TableHead>
                <TableHead>{ta("attempts")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.pastDue.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>{sub.user.email}</TableCell>
                  <TableCell>{sub.server.name}</TableCell>
                  <TableCell className="tabular-nums">
                    {money(sub.amountCents, sub.currency)}
                  </TableCell>
                  <TableCell>{sub.pastDueSince ? date(sub.pastDueSince) : "—"}</TableCell>
                  <TableCell className="tabular-nums">{sub.chargeAttempts}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title={ta("upcoming")}>
        {overview.upcoming.length === 0 ? (
          <Empty text={ta("empty")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ta("customer")}</TableHead>
                <TableHead>{ta("server")}</TableHead>
                <TableHead>{ta("amount")}</TableHead>
                <TableHead>{ta("renewsOn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.upcoming.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>{sub.user.email}</TableCell>
                  <TableCell>{sub.server.name}</TableCell>
                  <TableCell className="tabular-nums">
                    {money(Math.max(0, sub.amountCents - sub.creditCents), sub.currency)}
                  </TableCell>
                  <TableCell>
                    {date(sub.currentPeriodEnd)}
                    {sub.cancelAtPeriodEnd ? (
                      <span className="ml-2 text-xs text-warning">({ta("willCancel")})</span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <div>
        <div className="mb-4 flex w-fit gap-1 rounded-xl border border-white/5 bg-card/60 p-1">
          {TABS.map((value) => (
            <Link
              key={value}
              href={value === "orders" ? "/admin/billing" : `/admin/billing?tab=${value}`}
              className={cn(
                "rounded-lg px-3 py-1 text-sm font-medium transition-colors",
                tab === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t(value)}
            </Link>
          ))}
        </div>

        <section className="overflow-hidden rounded-2xl border border-white/5 bg-card">
          {rowCount === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto">{table}</div>
          )}
        </section>

        {rowCount >= LIST_LIMIT ? (
          <p className="mt-3 text-xs text-muted-foreground">{ta("limitNotice")}</p>
        ) : null}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/5 bg-card">
      <h2 className="border-b border-white/5 px-5 py-3 text-sm font-semibold text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-5 py-8 text-center text-sm text-muted-foreground">{text}</p>;
}
