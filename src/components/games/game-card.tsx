import Image from "next/image";
import { ArrowUpRight, Ban, Clock } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { Game } from "@/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { COMING_SOON } from "@/lib/games";
import { calculatePrice, formatMoney } from "@/lib/pricing/calculate-price";
import type { PricingTable } from "@/lib/pricing/types";
import { cn } from "@/lib/utils";

export async function GameCard({
  game,
  pricing,
}: {
  game: Game;
  pricing: PricingTable;
}) {
  const [t, locale] = await Promise.all([getTranslations("games"), getLocale()]);
  const comingSoon = !game.available && game.unavailableReason === COMING_SOON;

  const startingPrice = calculatePrice(
    {
      ramGb: game.minRamGb,
      vcpu: game.minCpu,
      storageGb: game.minStorageGb,
      regionMultiplier: 1,
      billingPeriod: "MONTHLY",
    },
    pricing,
  );

  const inner = (
    <>
      <div className="relative aspect-[16/9] overflow-hidden">
        <Image
          src={game.image}
          alt={game.name}
          fill
          unoptimized
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className={cn(
            "object-cover transition-transform duration-500 group-hover:scale-105",
            !game.available && "grayscale",
          )}
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent"
          aria-hidden
        />
        {!game.available ? (
          <Badge variant="secondary" className="absolute top-3 left-3 gap-1 bg-black/60 text-white">
            {comingSoon ? <Clock className="size-3" /> : <Ban className="size-3" />}
            {comingSoon ? t("comingSoon") : t("unavailable")}
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-heading text-lg font-semibold leading-tight">{game.name}</h3>
          {game.available ? (
            <ArrowUpRight className="size-5 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
          ) : null}
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">{game.tagline}</p>
        <div className="mt-auto flex items-end justify-between pt-5">
          {game.available ? (
            <p className="text-sm text-muted-foreground">
              {t("from")}{" "}
              <span className="font-heading text-xl font-bold text-foreground">
                {formatMoney(startingPrice.monthlyCents, pricing.currency, locale)}
              </span>
              <span className="text-xs">/mo</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {comingSoon ? t("comingSoonDesc") : game.unavailableReason}
            </p>
          )}
          {game.available ? (
            <p className="text-xs text-muted-foreground">
              {t("minRam")} {game.minRamGb} GB
            </p>
          ) : null}
        </div>
      </div>
    </>
  );

  const className = cn(
    "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/5 bg-card transition-all",
    game.available
      ? "hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_20px_60px_-20px_var(--accent-glow)]"
      : "opacity-70",
  );

  const style = { "--accent-glow": `${game.accentColor}88` } as React.CSSProperties;

  return (
    <Link href={`/games/${game.slug}`} className={className} style={style}>
      {inner}
    </Link>
  );
}
