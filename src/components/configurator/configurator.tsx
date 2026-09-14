"use client";

import { Cpu, HardDrive, Loader2, LogIn, MemoryStick, Rocket } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link, useRouter } from "@/i18n/navigation";
import type { PricingTable } from "@/lib/pricing/types";
import { createServerAction } from "@/server/actions/servers";
import { BillingToggle } from "./billing-toggle";
import { GamePicker } from "./game-picker";
import { PriceSummary } from "./price-summary";
import { RegionPicker } from "./region-picker";
import { ResourceSlider } from "./resource-slider";
import {
  useConfigurator,
  type ConfiguratorGame,
  type ConfiguratorRegion,
} from "./use-configurator";

type Props = {
  games: ConfiguratorGame[];
  regions: ConfiguratorRegion[];
  pricing: PricingTable;
  initialSearch: string;
  isAuthenticated: boolean;
};

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-7 items-center justify-center rounded-full bg-primary/15 font-heading text-sm font-bold text-primary">
          {number}
        </span>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function Configurator({ games, regions, pricing, initialSearch, isAuthenticated }: Props) {
  const t = useTranslations("configure");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nameError, setNameError] = useState<string | null>(null);

  const { state, update, selectGame, game, breakdown, limits, availableGames, searchString } =
    useConfigurator({ games, regions, pricing, initialSearch, syncUrl: true });

  const versionItems = (game?.versions ?? []).map((v) => ({ value: v, label: v }));

  function deploy() {
    if (state.name.trim().length < 3) {
      setNameError(t("errors.validation"));
      return;
    }
    setNameError(null);

    startTransition(async () => {
      const result = await createServerAction({
        name: state.name.trim(),
        gameSlug: state.gameSlug,
        gameVersion: state.gameVersion || undefined,
        ramGb: state.ramGb,
        vcpu: state.vcpu,
        storageGb: state.storageGb,
        regionCode: state.regionCode,
        billingPeriod: state.billingPeriod,
      });

      if (!result.ok) {
        const key = `errors.${result.error}` as const;
        toast.error(t.has(key) ? t(key) : t("errors.internal_error"));
        return;
      }

      toast.success(t("success"));
      router.push(`/dashboard/servers/${result.data.serverId}`);
    });
  }

  const loginHref = `/login?callbackUrl=${encodeURIComponent(`/configure?${searchString}`)}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-10">
        <Step number={1} title={t("steps.game")}>
          <GamePicker games={availableGames} value={state.gameSlug} onChange={selectGame} />
          {versionItems.length > 0 ? (
            <div className="mt-4 flex items-center gap-3">
              <Label htmlFor="version" className="text-sm text-muted-foreground">
                {t("version")}
              </Label>
              <Select
                items={versionItems}
                value={state.gameVersion}
                onValueChange={(v) => update({ gameVersion: (v as string) ?? "" })}
              >
                <SelectTrigger id="version" className="min-w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {versionItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </Step>

        <Step number={2} title={t("steps.resources")}>
          <div className="grid gap-4">
            <ResourceSlider
              icon={<MemoryStick className="size-4" />}
              label={t("ram")}
              hint={
                game
                  ? `${t("minFor", { game: game.name, value: `${game.minRamGb} GB` })} · ${t("recommendedFor", { value: `${game.recommendedRamGb} GB` })}`
                  : undefined
              }
              value={state.ramGb}
              min={limits.ram.min}
              max={limits.ram.max}
              step={limits.ram.step}
              unit="GB"
              onChange={(ramGb) => update({ ramGb })}
            />
            <ResourceSlider
              icon={<Cpu className="size-4" />}
              label={t("cpu")}
              hint={game ? t("minFor", { game: game.name, value: `${game.minCpu} vCPU` }) : undefined}
              value={state.vcpu}
              min={limits.cpu.min}
              max={limits.cpu.max}
              step={limits.cpu.step}
              unit="vCPU"
              onChange={(vcpu) => update({ vcpu })}
            />
            <ResourceSlider
              icon={<HardDrive className="size-4" />}
              label={t("storage")}
              hint={
                game ? t("minFor", { game: game.name, value: `${game.minStorageGb} GB` }) : undefined
              }
              value={state.storageGb}
              min={limits.storage.min}
              max={limits.storage.max}
              step={limits.storage.step}
              unit="GB"
              onChange={(storageGb) => update({ storageGb })}
            />
          </div>
        </Step>

        <Step number={3} title={t("steps.region")}>
          <RegionPicker
            regions={regions}
            value={state.regionCode}
            onChange={(regionCode) => update({ regionCode })}
          />
        </Step>

        <Step number={4} title={t("steps.billing")}>
          <BillingToggle
            value={state.billingPeriod}
            onChange={(billingPeriod) => update({ billingPeriod })}
            pricing={pricing}
          />
        </Step>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <PriceSummary breakdown={breakdown}>
          <div className="mt-5 space-y-2">
            <Label htmlFor="server-name">{t("serverName")}</Label>
            <Input
              id="server-name"
              value={state.name}
              placeholder={t("serverNamePlaceholder")}
              maxLength={40}
              onChange={(e) => update({ name: e.target.value })}
              aria-invalid={Boolean(nameError)}
            />
            {nameError ? <p className="text-xs text-destructive">{nameError}</p> : null}
          </div>

          {isAuthenticated ? (
            <Button
              className="glow-primary mt-4 h-11 w-full text-base"
              size="lg"
              onClick={deploy}
              disabled={pending}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Rocket data-icon="inline-start" />}
              {pending ? t("deploying") : t("deploy")}
            </Button>
          ) : (
            <Button
              className="mt-4 h-11 w-full text-base"
              size="lg"
              render={<Link href={loginHref} />}
            >
              <LogIn data-icon="inline-start" />
              {t("deployLogin")}
            </Button>
          )}

          <p className="mt-3 text-center text-[11px] text-muted-foreground">{t("previewNotice")}</p>
        </PriceSummary>
      </aside>
    </div>
  );
}
