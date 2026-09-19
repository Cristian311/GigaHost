"use client";

import { Check, Loader2, Tag, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { previewCouponAction } from "@/server/actions/servers";

export type AppliedCoupon = { code: string; discountCents: number };

type Config = {
  gameSlug: string;
  ramGb: number;
  vcpu: number;
  storageGb: number;
  regionCode: string;
  billingPeriod: string;
};

/**
 * Lets the customer enter a coupon and keeps its discount in sync with the
 * configuration: a percentage is worth a different amount every time a slider
 * moves, so the code is re-priced by the server whenever the config settles.
 */
export function CouponField({
  config,
  onChange,
}: {
  config: Config;
  onChange: (coupon: AppliedCoupon | null) => void;
}) {
  const t = useTranslations("configure.coupon");
  const [input, setInput] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "checking" | "applied">("idle");
  const [error, setError] = useState<string | null>(null);

  const { gameSlug, ramGb, vcpu, storageGb, regionCode, billingPeriod } = config;

  useEffect(() => {
    if (!code) return;
    let cancelled = false;

    const timer = setTimeout(async () => {
      setStatus("checking");
      const result = await previewCouponAction({
        gameSlug,
        ramGb,
        vcpu,
        storageGb,
        regionCode,
        billingPeriod,
        couponCode: code,
      });
      if (cancelled) return;

      if (result.ok) {
        setStatus("applied");
        setError(null);
        onChange({ code: result.data.code, discountCents: result.data.discountCents });
      } else {
        setStatus("idle");
        setCode(null);
        setError(result.error);
        onChange(null);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, gameSlug, ramGb, vcpu, storageGb, regionCode, billingPeriod, onChange]);

  function apply() {
    const next = input.trim().toUpperCase();
    if (!next) return;
    setError(null);
    setCode(next);
  }

  function remove() {
    setCode(null);
    setInput("");
    setStatus("idle");
    setError(null);
    onChange(null);
  }

  const errorKey = error ? (`errors.${error}` as const) : null;

  return (
    <div className="mt-5 space-y-2">
      <Label htmlFor="coupon-code" className="flex items-center gap-1.5">
        <Tag className="size-3.5" /> {t("label")}
      </Label>

      {status === "applied" && code ? (
        <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          <span className="flex items-center gap-2 font-mono font-medium">
            <Check className="size-4" /> {code}
          </span>
          <Button size="icon-sm" variant="ghost" onClick={remove} aria-label={t("remove")}>
            <X />
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            id="coupon-code"
            value={input}
            placeholder={t("placeholder")}
            maxLength={32}
            autoCapitalize="characters"
            className="font-mono uppercase placeholder:normal-case placeholder:font-sans"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply();
              }
            }}
            aria-invalid={Boolean(error)}
          />
          <Button
            variant="outline"
            onClick={apply}
            disabled={status === "checking" || input.trim().length === 0}
          >
            {status === "checking" ? <Loader2 className="animate-spin" /> : null}
            {t("apply")}
          </Button>
        </div>
      )}

      {errorKey ? (
        <p className="text-xs text-destructive">
          {t.has(errorKey) ? t(errorKey) : t("errors.internal_error")}
        </p>
      ) : null}
    </div>
  );
}
