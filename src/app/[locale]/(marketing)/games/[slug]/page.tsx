import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Ban, Clock, Cpu, HardDrive, MemoryStick, Tag } from "lucide-react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { COMING_SOON, parseVersions } from "@/lib/games";
import { calculatePrice, formatMoney } from "@/lib/pricing/calculate-price";
import { cn } from "@/lib/utils";
import { getActivePricing, getGameBySlug, toPricingTable } from "@/server/services/pricing-service";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/games/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const game = await getGameBySlug(slug);
  return { title: game?.name ?? "Game", description: game?.tagline };
}

export default async function GameDetailPage({ params }: PageProps<"/[locale]/games/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [t, game, pricing, currentLocale] = await Promise.all([
    getTranslations("games"),
    getGameBySlug(slug),
    getActivePricing(),
    getLocale(),
  ]);
  if (!game) notFound();

  const comingSoon = !game.available && game.unavailableReason === COMING_SOON;
  const table = toPricingTable(pricing);
  const versions = parseVersions(game.versions);
  const starting = calculatePrice(
    {
      ramGb: game.minRamGb,
      vcpu: game.minCpu,
      storageGb: game.minStorageGb,
      regionMultiplier: 1,
      billingPeriod: "MONTHLY",
    },
    table,
  );
  const recommended = calculatePrice(
    {
      ramGb: game.recommendedRamGb,
      vcpu: Math.max(game.minCpu, 2),
      storageGb: Math.max(game.minStorageGb, 25),
      regionMultiplier: 1,
      billingPeriod: "MONTHLY",
    },
    table,
  );

  const specs = [
    { icon: MemoryStick, label: t("minRam"), value: `${game.minRamGb} GB` },
    { icon: MemoryStick, label: t("recommendedRam"), value: `${game.recommendedRamGb} GB` },
    { icon: Cpu, label: t("minCpu"), value: `${game.minCpu} vCPU` },
    { icon: HardDrive, label: t("minStorage"), value: `${game.minStorageGb} GB NVMe` },
  ];

  return (
    <div className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] opacity-40 blur-3xl"
        style={{
          background: `radial-gradient(60% 60% at 50% 0%, ${game.accentColor}66, transparent 70%)`,
        }}
        aria-hidden
      />
      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <Link
          href="/games"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {t("backToGames")}
        </Link>

        <div className="mt-6 grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
          <div>
            <div className="relative aspect-[16/9] overflow-hidden rounded-3xl border border-white/5">
              <Image src={game.image} alt={game.name} fill unoptimized priority className="object-cover" />
            </div>
            <h1 className="mt-8 text-4xl font-bold sm:text-5xl">{game.name}</h1>
            <p className="mt-3 text-lg text-muted-foreground">{game.tagline}</p>
            <p className="mt-6 max-w-2xl leading-relaxed text-foreground/85">{game.description}</p>

            {versions.length > 0 ? (
              <div className="mt-8">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase">
                  <Tag className="size-4" /> {t("versions")}
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {versions.map((v) => (
                    <Badge key={v} variant="outline" className="h-7 px-3 font-mono">
                      {v}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <aside className="glass rounded-3xl p-6 lg:sticky lg:top-24">
            {game.available ? (
              <>
                <p className="text-sm text-muted-foreground">{t("from")}</p>
                <p className="font-heading text-4xl font-bold">
                  {formatMoney(starting.monthlyCents, table.currency, currentLocale)}
                  <span className="text-base font-medium text-muted-foreground">/mo</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("recommendedRam")}:{" "}
                  {formatMoney(recommended.monthlyCents, table.currency, currentLocale)}/mo
                </p>

                <dl className="mt-6 grid grid-cols-2 gap-3">
                  {specs.map((spec) => (
                    <div key={spec.label} className="rounded-xl bg-white/[0.04] p-3">
                      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <spec.icon className="size-3.5" /> {spec.label}
                      </dt>
                      <dd className="mt-1 font-semibold">{spec.value}</dd>
                    </div>
                  ))}
                </dl>

                <Button
                  className="glow-primary mt-6 h-11 w-full text-base"
                  size="lg"
                  render={<Link href={`/configure?game=${game.slug}`} />}
                >
                  {t("configure", { game: game.name })}
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </>
            ) : (
              <div className="text-center">
                <span
                  className={cn(
                    "mx-auto flex size-12 items-center justify-center rounded-full",
                    comingSoon ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive",
                  )}
                >
                  {comingSoon ? <Clock className="size-6" /> : <Ban className="size-6" />}
                </span>
                <h2 className="mt-4 text-lg font-semibold">
                  {comingSoon ? t("comingSoonTitle") : t("notAvailableTitle")}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {comingSoon
                    ? t("comingSoonDesc")
                    : t("notAvailableDesc", { reason: game.unavailableReason ?? "" })}
                </p>
                <Button variant="outline" className="mt-6 w-full" render={<Link href="/games" />}>
                  {t("backToGames")}
                </Button>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
