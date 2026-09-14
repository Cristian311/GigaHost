import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GameCard } from "@/components/games/game-card";
import { SectionHeading } from "@/components/section-heading";
import { getActivePricing, getGames, toPricingTable } from "@/server/services/pricing-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("games");
  return { title: t("title") };
}

export default async function GamesPage({ params }: PageProps<"/[locale]/games">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, games, pricing] = await Promise.all([
    getTranslations("games"),
    getGames(),
    getActivePricing(),
  ]);
  const table = toPricingTable(pricing);

  return (
    <div className="bg-glow">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <SectionHeading align="left" title={t("title")} subtitle={t("subtitle")} />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <GameCard key={game.id} game={game} pricing={table} />
          ))}
        </div>
      </div>
    </div>
  );
}
