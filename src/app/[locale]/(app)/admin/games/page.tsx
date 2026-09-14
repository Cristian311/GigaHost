import { setRequestLocale } from "next-intl/server";
import { GamesManager } from "@/components/admin/games-manager";
import { parseVersions } from "@/lib/games";
import { getGames } from "@/server/services/pricing-service";

export default async function AdminGamesPage({ params }: PageProps<"/[locale]/admin/games">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const games = await getGames();
  return (
    <GamesManager
      games={games.map((g) => ({
        id: g.id,
        slug: g.slug,
        name: g.name,
        tagline: g.tagline,
        description: g.description,
        image: g.image,
        accentColor: g.accentColor,
        minRamGb: g.minRamGb,
        recommendedRamGb: g.recommendedRamGb,
        minCpu: g.minCpu,
        minStorageGb: g.minStorageGb,
        versions: parseVersions(g.versions),
        available: g.available,
        unavailableReason: g.unavailableReason,
        sortOrder: g.sortOrder,
      }))}
    />
  );
}
