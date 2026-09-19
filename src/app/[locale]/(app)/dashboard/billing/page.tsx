import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
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
import { requireUser } from "@/server/auth-guard";
import {
  listInvoicesForUser,
  listOrdersForUser,
  listSubscriptionsForUser,
} from "@/server/services/order-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("billing");
  return { title: t("title") };
}

export default async function BillingPage({ params }: PageProps<"/[locale]/dashboard/billing">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();

  const [t, tp, format, currentLocale, subscriptions, invoices, orders] = await Promise.all([
    getTranslations("billing"),
    getTranslations("configure.periods"),
    getFormatter(),
    getLocale(),
    listSubscriptionsForUser(user.id),
    listInvoicesForUser(user.id),
    listOrdersForUser(user.id),
  ]);

  const date = (d: Date) => format.dateTime(d, { dateStyle: "medium" });

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <p className="mb-6 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
        {t("previewNotice")}
      </p>

      <Section title={t("subscriptions")}>
        {subscriptions.length === 0 ? (
          <Empty text={t("empty")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("server")}</TableHead>
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
                    <Link
                      href={`/dashboard/servers/${sub.server.id}`}
                      className="font-medium hover:underline"
                    >
                      {sub.server.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{sub.server.game.name}</p>
                  </TableCell>
                  <TableCell>{tp(sub.billingPeriod)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatMoney(sub.amountCents, sub.currency, currentLocale)}
                  </TableCell>
                  <TableCell>
                    {date(sub.currentPeriodEnd)}
                    {sub.cancelAtPeriodEnd ? (
                      <p className="text-xs text-warning">{t("cancelScheduled")}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={BILLING_STATUS_VARIANT[sub.status]}>{t(`statuses.${sub.status}`)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title={t("invoices")}>
        {invoices.length === 0 ? (
          <Empty text={t("empty")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("invoiceNumber")}</TableHead>
                <TableHead>{t("date")}</TableHead>
                <TableHead>{t("amount")}</TableHead>
                <TableHead>{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono">{inv.number}</TableCell>
                  <TableCell>{date(inv.issuedAt)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatMoney(inv.amountCents, inv.currency, currentLocale)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={BILLING_STATUS_VARIANT[inv.status]}>{t(`statuses.${inv.status}`)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title={t("orders")}>
        {orders.length === 0 ? (
          <Empty text={t("empty")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("date")}</TableHead>
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
                  <TableCell>{order.server?.name ?? "—"}</TableCell>
                  <TableCell>{tp(order.billingPeriod)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatMoney(order.totalCents, order.currency, currentLocale)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={BILLING_STATUS_VARIANT[order.status]}>{t(`statuses.${order.status}`)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-white/5 bg-card">
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
