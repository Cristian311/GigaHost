"use client";

import { ArrowRight, Cpu, HardDrive, MemoryStick } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/pricing/calculate-price";
import type { PricingTable } from "@/lib/pricing/types";
import { BillingToggle } from "@/components/configurator/billing-toggle";
import { ResourceSlider } from "@/components/configurator/resource-slider";
import {
  useConfigurator,
  type ConfiguratorGame,
  type ConfiguratorRegion,
} from "@/components/configurator/use-configurator";

export function PricingPreview({
  games,
  regions,
  pricing,
}: {
  games: ConfiguratorGame[];
  regions: ConfiguratorRegion[];
  pricing: PricingTable;
}) {
  const t = useTranslations("landing.pricing");
  const tc = useTranslations("configure");
  const locale = useLocale();
  const { state, update, breakdown, limits, searchString } = useConfigurator({
    games,
    regions,
    pricing,
  });

  return (
    <div className="glass grid gap-8 rounded-3xl p-6 sm:p-8 lg:grid-cols-[1fr_300px]">
      <div className="grid gap-4">
        <ResourceSlider
          icon={<MemoryStick className="size-4" />}
          label={tc("ram")}
          value={state.ramGb}
          min={limits.ram.min}
          max={limits.ram.max}
          step={limits.ram.step}
          unit="GB"
          onChange={(ramGb) => update({ ramGb })}
        />
        <ResourceSlider
          icon={<Cpu className="size-4" />}
          label={tc("cpu")}
          value={state.vcpu}
          min={limits.cpu.min}
          max={limits.cpu.max}
          step={limits.cpu.step}
          unit="vCPU"
          onChange={(vcpu) => update({ vcpu })}
        />
        <ResourceSlider
          icon={<HardDrive className="size-4" />}
          label={tc("storage")}
          value={state.storageGb}
          min={limits.storage.min}
          max={limits.storage.max}
          step={limits.storage.step}
          unit="GB"
          onChange={(storageGb) => update({ storageGb })}
        />
      </div>

      <div className="flex flex-col">
        <BillingToggle
          value={state.billingPeriod}
          onChange={(billingPeriod) => update({ billingPeriod })}
          pricing={pricing}
        />
        <div className="mt-6 flex-1 rounded-2xl bg-primary/10 p-5">
          <p className="text-xs text-muted-foreground">{tc("effective")}</p>
          <p className="font-heading text-4xl font-bold tabular-nums">
            {formatMoney(breakdown.effectiveMonthlyCents, breakdown.currency, locale)}
            <span className="text-base font-medium text-muted-foreground">/mo</span>
          </p>
          {breakdown.months > 1 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {tc("total")}: {formatMoney(breakdown.totalCents, breakdown.currency, locale)}
            </p>
          ) : null}
        </div>
        <Button
          className="glow-primary mt-4 h-11 w-full"
          size="lg"
          render={<Link href={`/configure?${searchString}`} />}
        >
          {t("cta")}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}
