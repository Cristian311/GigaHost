import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { GameCard } from "@/components/games/game-card";
import { FadeIn } from "@/components/motion/fade-in";
import { SectionHeading } from "@/components/section-heading";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getActivePricing, getGames, toPricingTable } from "@/server/services/pricing-service";

export async function GamesGrid({ limit = 6 }: { limit?: number }) {
  const [t, games, pricing] = await Promise.all([
    getTranslations("landing.games"),
    getGames({ onlyAvailable: true }),
    getActivePricing(),
  ]);
  const table = toPricingTable(pricing);

  return (
    <section id="games" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <FadeIn>
          <SectionHeading eyebrow="Games" title={t("title")} subtitle={t("subtitle")} />
        </FadeIn>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {games.slice(0, limit).map((game, index) => (
            <FadeIn key={game.id} delay={index * 0.05} className="h-full">
              <GameCard game={game} pricing={table} />
            </FadeIn>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Button variant="outline" size="lg" render={<Link href="/games" />}>
            {t("viewAll")}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </div>
    </section>
  );
}
