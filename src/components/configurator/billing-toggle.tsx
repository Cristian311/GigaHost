"use client";

import { useTranslations } from "next-intl";
import { BILLING_PERIODS, type BillingPeriod, type PricingTable } from "@/lib/pricing/types";
import { cn } from "@/lib/utils";

export function BillingToggle({
  value,
  onChange,
  pricing,
}: {
  value: BillingPeriod;
  onChange: (period: BillingPeriod) => void;
  pricing: PricingTable;
}) {
  const t = useTranslations("configure");
  const discounts: Record<BillingPeriod, number> = {
    MONTHLY: 0,
    QUARTERLY: pricing.quarterlyDiscount,
    YEARLY: pricing.yearlyDiscount,
  };

  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/5 bg-card/60 p-1">
      {BILLING_PERIODS.map((period) => {
        const selected = period === value;
        const discount = Math.round(discounts[period] * 100);
        return (
          <button
            key={period}
            type="button"
            onClick={() => onChange(period)}
            aria-pressed={selected}
            className={cn(
              "flex flex-col items-center justify-center rounded-lg px-2 py-2.5 text-sm font-medium transition-all",
              selected
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span>{t(`periods.${period}`)}</span>
            {discount > 0 ? (
              <span
                className={cn(
                  "mt-0.5 text-[10px] font-semibold",
                  selected ? "text-primary-foreground/80" : "text-success",
                )}
              >
                {t("saveBadge", { percent: `${discount}%` })}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
