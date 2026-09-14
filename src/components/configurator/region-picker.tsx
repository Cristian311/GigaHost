"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConfiguratorRegion } from "./use-configurator";

export function RegionPicker({
  regions,
  value,
  onChange,
}: {
  regions: ConfiguratorRegion[];
  value: string;
  onChange: (code: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {regions.map((region) => {
        const selected = region.code === value;
        const delta = Math.round((region.priceMultiplier - 1) * 100);
        return (
          <button
            key={region.code}
            type="button"
            onClick={() => onChange(region.code)}
            className={cn(
              "relative flex flex-col items-start rounded-xl border p-4 text-left transition-all",
              selected
                ? "border-primary bg-primary/10 shadow-[0_0_0_1px_var(--primary)]"
                : "border-white/5 bg-card/60 hover:border-white/15 hover:bg-card",
            )}
            aria-pressed={selected}
          >
            <span className="text-2xl leading-none">{region.flag}</span>
            <span className="mt-3 text-sm font-semibold">{region.name}</span>
            <span className="text-xs text-muted-foreground">{region.country}</span>
            <span
              className={cn(
                "mt-2 text-[11px] font-medium",
                delta > 0 ? "text-warning" : "text-success",
              )}
            >
              {delta > 0 ? `+${delta}%` : delta < 0 ? `${delta}%` : "base"}
            </span>
            {selected ? (
              <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" strokeWidth={3} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
