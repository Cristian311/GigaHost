"use client";

import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

type Props = {
  icon: React.ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  hint?: string;
  onChange: (value: number) => void;
  className?: string;
};

export function ResourceSlider({
  icon,
  label,
  value,
  min,
  max,
  step,
  unit,
  hint,
  onChange,
  className,
}: Props) {
  return (
    <div className={cn("rounded-2xl border border-white/5 bg-card/60 p-5", className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            {icon}
          </span>
          <div>
            <p className="text-sm font-medium">{label}</p>
            {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
          </div>
        </div>
        <div className="flex items-baseline gap-1 font-heading">
          <span className="text-2xl font-bold tabular-nums">{value}</span>
          <span className="text-sm text-muted-foreground">{unit}</span>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          className="flex size-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-sm hover:bg-muted disabled:opacity-40"
          onClick={() => onChange(Math.max(min, value - step))}
          disabled={value <= min}
          aria-label="-"
        >
          −
        </button>
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={(next) => {
            const v = Array.isArray(next) ? next[0] : next;
            onChange(v);
          }}
          className="[&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:bg-primary [&_[data-slot=slider-track]]:h-2"
        />
        <button
          type="button"
          className="flex size-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-sm hover:bg-muted disabled:opacity-40"
          onClick={() => onChange(Math.min(max, value + step))}
          disabled={value >= max}
          aria-label="+"
        >
          +
        </button>
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>
          {min} {unit}
        </span>
        <span>
          {max} {unit}
        </span>
      </div>
    </div>
  );
}
