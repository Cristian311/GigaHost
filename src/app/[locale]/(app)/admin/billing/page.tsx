import { AlertTriangle, Repeat, Wallet } from "lucide-react";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { RunBillingButton } from "@/components/admin/run-billing-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/pricing/calculate-price";
import { getActivePricing } from "@/server/services/pricing-service";
import { getBillingOverview } from "@/server/services/renewal-service";

export default async function AdminBillingPage({ params }: PageProps<"/[locale]/admin/billing">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, format, currentLocale, overview, pricing] = await Promise.all([
    getTranslations("admin.billing"),
    getFormatter(),
    getLocale(),
    getBillingOverview(),
    getActivePricing(),
  ]);

  const date = (d: Date) => format.dateTime(d, { dateStyle: "medium" });
  const tiles = [
    { icon: Repeat, label: t("activeSubscriptions"), value: String(overview.activeCount) },
    {
      icon: Wallet,
      label: t("mrr"),
      value: formatMoney(overview.monthlyRecurringCents, pricing.currency, currentLocale),
    },
    { icon: AlertTriangle, label: t("pastDueCount"), value: String(overview.pastDue.length) },
  ];

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

      <RunBillingButton />

      <Section title={t("pastDue")}>
        {overview.pastDue.length === 0 ? (
          <Empty text={t("empty")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("customer")}</TableHead>
                <TableHead>{t("server")}</TableHead>
                <TableHead>{t("amount")}</TableHead>
                <TableHead>{t("unpaidSince")}</TableHead>
                <TableHead>{t("attempts")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.pastDue.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>{sub.user.email}</TableCell>
                  <TableCell>{sub.server.name}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatMoney(sub.amountCents, sub.currency, currentLocale)}
                  </TableCell>
                  <TableCell>{sub.pastDueSince ? date(sub.pastDueSince) : "—"}</TableCell>
                  <TableCell className="tabular-nums">{sub.chargeAttempts}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title={t("upcoming")}>
        {overview.upcoming.length === 0 ? (
          <Empty text={t("empty")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("customer")}</TableHead>
                <TableHead>{t("server")}</TableHead>
                <TableHead>{t("amount")}</TableHead>
                <TableHead>{t("renewsOn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.upcoming.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>{sub.user.email}</TableCell>
                  <TableCell>{sub.server.name}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatMoney(
                      Math.max(0, sub.amountCents - sub.creditCents),
                      sub.currency,
                      currentLocale,
                    )}
                  </TableCell>
                  <TableCell>
                    {date(sub.currentPeriodEnd)}
                    {sub.cancelAtPeriodEnd ? (
                      <span className="ml-2 text-xs text-warning">({t("willCancel")})</span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
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
