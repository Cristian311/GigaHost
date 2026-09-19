import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
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

const TABS = ["orders", "invoices", "subscriptions"] as const;
type Tab = (typeof TABS)[number];

const LIST_LIMIT = 200;

export default async function AdminBillingPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/billing">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();

  const { tab: rawTab } = await searchParams;
  const tab: Tab = TABS.find((x) => x === rawTab) ?? "orders";

  const [t, ta, tp, format, currentLocale] = await Promise.all([
    getTranslations("billing"),
    getTranslations("admin.billing"),
    getTranslations("configure.periods"),
    getFormatter(),
    getLocale(),
  ]);

  const date = (d: Date) => format.dateTime(d, { dateStyle: "medium" });
  const money = (cents: number, currency: string) => formatMoney(cents, currency, currentLocale);
  const status = (value: string) => (
    <Badge variant={BILLING_STATUS_VARIANT[value]}>{t(`statuses.${value}`)}</Badge>
  );

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
    <>
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
    </>
  );
}
