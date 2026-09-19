"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@/lib/pricing/calculate-price";
import type { PriceBreakdown } from "@/lib/pricing/types";
import { cn } from "@/lib/utils";

export function PriceSummary({
  breakdown,
  coupon,
  className,
  children,
}: {
  breakdown: PriceBreakdown;
  /** Server-validated coupon; only ever discounts the first invoice. */
  coupon?: { code: string; discountCents: number } | null;
  className?: string;
  children?: React.ReactNode;
}) {
  const t = useTranslations("configure");
  const locale = useLocale();
  const money = (cents: number) => formatMoney(cents, breakdown.currency, locale);
  const totalCents = breakdown.totalCents - (coupon?.discountCents ?? 0);

  const rows: Array<{ label: string; value: string; muted?: boolean }> = [
    { label: t("base"), value: money(breakdown.baseCents), muted: true },
    { label: "RAM", value: money(breakdown.ramCents), muted: true },
    { label: "vCPU", value: money(breakdown.cpuCents), muted: true },
    { label: "NVMe", value: money(breakdown.storageCents), muted: true },
  ];
  if (breakdown.regionAdjustmentCents !== 0) {
    rows.push({
      label: t("regionAdjustment"),
      value: `${breakdown.regionAdjustmentCents > 0 ? "+" : ""}${money(breakdown.regionAdjustmentCents)}`,
      muted: true,
    });
  }

  return (
    <div className={cn("glass rounded-2xl p-6", className)}>
      <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {t("summary")}
      </h3>

      <dl className="mt-4 space-y-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <dt className={cn(row.muted && "text-muted-foreground")}>{row.label}</dt>
            <dd className="tabular-nums">{row.value}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-white/10 pt-2 font-medium">
          <dt>{t("monthlyPrice")}</dt>
          <dd className="tabular-nums">{money(breakdown.monthlyCents)}</dd>
        </div>
        {breakdown.months > 1 ? (
          <>
            <div className="flex items-center justify-between text-muted-foreground">
              <dt>{t("subtotal", { months: breakdown.months })}</dt>
              <dd className="tabular-nums">{money(breakdown.subtotalCents)}</dd>
            </div>
            <div className="flex items-center justify-between text-success">
              <dt>{t("discount", { percent: `${Math.round(breakdown.discountRate * 100)}%` })}</dt>
              <dd className="tabular-nums">−{money(breakdown.discountCents)}</dd>
            </div>
          </>
        ) : null}
        {coupon ? (
          <div className="flex items-center justify-between text-success">
            <dt>{t("coupon.applied", { code: coupon.code })}</dt>
            <dd className="tabular-nums">−{money(coupon.discountCents)}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-5 rounded-xl bg-primary/10 p-4">
        <p className="text-xs text-muted-foreground">{t("total")}</p>
        <p className="font-heading text-3xl font-bold tabular-nums">{money(totalCents)}</p>
        {breakdown.months > 1 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("effective")}: {money(breakdown.effectiveMonthlyCents)}
          </p>
        ) : null}
        {coupon ? (
          <p className="mt-1 text-xs text-muted-foreground">{t("coupon.firstInvoiceOnly")}</p>
        ) : null}
      </div>

      {children}
    </div>
  );
}
