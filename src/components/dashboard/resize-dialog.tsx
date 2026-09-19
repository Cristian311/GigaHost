"use client";

import { Cpu, HardDrive, Loader2, MemoryStick, SlidersHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ResourceSlider } from "@/components/configurator/resource-slider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { RESOURCE_LIMITS } from "@/lib/constants";
import { formatMoney } from "@/lib/pricing/calculate-price";
import type { ResizePreview } from "@/server/services/resize-service";
import { previewResizeAction, resizeServerAction } from "@/server/actions/servers";
import { cn } from "@/lib/utils";

type Props = {
  serverId: string;
  current: { ramGb: number; vcpu: number; storageGb: number };
  minimums: { ramGb: number; vcpu: number; storageGb: number };
  disabled?: boolean;
};

export function ResizeDialog({ serverId, current, minimums, disabled }: Props) {
  const t = useTranslations("dashboard.resize");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [config, setConfig] = useState(current);
  const [preview, setPreview] = useState<ResizePreview | null>(null);

  const changed = useMemo(
    () =>
      config.ramGb !== current.ramGb ||
      config.vcpu !== current.vcpu ||
      config.storageGb !== current.storageGb,
    [config, current],
  );

  /** Always start from the values the server currently has. */
  function changeOpen(next: boolean) {
    if (next) {
      setConfig(current);
      setPreview(null);
    }
    setOpen(next);
  }

  // Ask the server for an authoritative price whenever the sliders settle.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await previewResizeAction(serverId, config);
      if (cancelled) return;
      setPreview(result.ok ? result.data : null);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, serverId, config]);

  const money = (cents: number) =>
    formatMoney(cents, preview?.currency ?? "EUR", locale);

  function apply() {
    startTransition(async () => {
      const result = await resizeServerAction(serverId, config);
      if (!result.ok) {
        const key = `errors.${result.error}` as const;
        toast.error(t.has(key) ? t(key) : t("errors.internal_error"));
        return;
      }
      const { chargeCents, creditCents } = result.data;
      toast.success(
        chargeCents > 0
          ? `${t("success")} ${t("charged", { amount: money(chargeCents) })}`
          : creditCents > 0
            ? `${t("success")} ${t("credited", { amount: money(creditCents) })}`
            : t("success"),
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => changeOpen(true)} disabled={disabled}>
        <SlidersHorizontal data-icon="inline-start" />
        {t("button")}
      </Button>

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <ResourceSlider
              icon={<MemoryStick className="size-4" />}
              label="RAM"
              value={config.ramGb}
              min={minimums.ramGb}
              max={RESOURCE_LIMITS.ram.max}
              step={RESOURCE_LIMITS.ram.step}
              unit="GB"
              onChange={(ramGb) => setConfig((c) => ({ ...c, ramGb }))}
            />
            <ResourceSlider
              icon={<Cpu className="size-4" />}
              label="vCPU"
              value={config.vcpu}
              min={minimums.vcpu}
              max={RESOURCE_LIMITS.cpu.max}
              step={RESOURCE_LIMITS.cpu.step}
              unit="vCPU"
              onChange={(vcpu) => setConfig((c) => ({ ...c, vcpu }))}
            />
            <ResourceSlider
              icon={<HardDrive className="size-4" />}
              label="NVMe"
              value={config.storageGb}
              min={minimums.storageGb}
              max={RESOURCE_LIMITS.storage.max}
              step={RESOURCE_LIMITS.storage.step}
              unit="GB"
              onChange={(storageGb) => setConfig((c) => ({ ...c, storageGb }))}
            />
          </div>

          <div className="rounded-xl bg-white/[0.04] p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("monthlyNow")}</span>
              <span className="tabular-nums">
                {preview ? money(preview.oldMonthlyCents) : "—"}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">{t("monthlyAfter")}</span>
              <span
                className={cn(
                  "tabular-nums font-medium",
                  preview && preview.newMonthlyCents > preview.oldMonthlyCents && "text-warning",
                  preview && preview.newMonthlyCents < preview.oldMonthlyCents && "text-success",
                )}
              >
                {preview ? money(preview.newMonthlyCents) : "—"}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">{t("remaining")}</span>
              <span className="tabular-nums">
                {preview ? `${Math.round(preview.proration.remainingFraction * 100)}%` : "—"}
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <span className="font-medium">
                {preview && preview.proration.creditCents > 0 ? t("credit") : t("dueNow")}
              </span>
              <span className="font-heading text-xl font-bold tabular-nums">
                {preview
                  ? money(
                      preview.proration.creditCents > 0
                        ? preview.proration.creditCents
                        : preview.proration.chargeCents,
                    )
                  : "—"}
              </span>
            </div>
            {preview && preview.proration.creditCents > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">{t("noChargeHint")}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={apply} disabled={pending || !changed}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {pending ? t("applying") : t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
