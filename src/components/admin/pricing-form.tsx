"use client";

import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculatePrice, formatMoney } from "@/lib/pricing/calculate-price";
import type { PricingTable } from "@/lib/pricing/types";
import { updatePricingAction } from "@/server/actions/admin";

export function PricingForm({ initial }: { initial: PricingTable }) {
  const t = useTranslations("admin.pricing");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<PricingTable>(initial);

  const preview = useMemo(
    () =>
      calculatePrice(
        { ramGb: 8, vcpu: 4, storageGb: 50, regionMultiplier: 1, billingPeriod: "MONTHLY" },
        form,
      ),
    [form],
  );

  const numberField = (key: keyof PricingTable, label: string, step = 1) => (
    <div className="space-y-2">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type="number"
        step={step}
        min={0}
        value={form[key] as number}
        onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
      />
    </div>
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updatePricingAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t("saved"));
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="grid gap-4 rounded-2xl border border-white/5 bg-card p-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="currency">{t("currency")}</Label>
          <Input
            id="currency"
            value={form.currency}
            maxLength={3}
            onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
          />
        </div>
        {numberField("basePriceCents", t("base"))}
        {numberField("pricePerGbRamCents", t("ram"))}
        {numberField("pricePerVcpuCents", t("cpu"))}
        {numberField("pricePerGbStorageCents", t("storage"))}
        {numberField("quarterlyDiscount", t("quarterly"), 0.01)}
        {numberField("yearlyDiscount", t("yearly"), 0.01)}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {t("title")}
          </Button>
        </div>
      </div>
      <aside className="glass rounded-2xl p-6">
        <p className="text-xs text-muted-foreground">{t("preview")}</p>
        <p className="mt-2 font-heading text-3xl font-bold">
          {formatMoney(preview.monthlyCents, form.currency || "EUR", locale)}
          <span className="text-sm font-medium text-muted-foreground">/mo</span>
        </p>
        <p className="mt-4 text-xs text-muted-foreground">{t("desc")}</p>
      </aside>
    </form>
  );
}
