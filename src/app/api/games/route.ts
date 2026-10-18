import { NextResponse } from "next/server";
import { withApi } from "@/server/api";
import { parseVersions } from "@/lib/games";
import { getGames } from "@/server/services/pricing-service";

export async function GET(request: Request) {
  return withApi(request, async () => {
    const games = await getGames();
    return NextResponse.json(
      games.map((g) => ({
        slug: g.slug,
        name: g.name,
        tagline: g.tagline,
        image: g.image,
        minRamGb: g.minRamGb,
        recommendedRamGb: g.recommendedRamGb,
        minCpu: g.minCpu,
        minStorageGb: g.minStorageGb,
        versions: parseVersions(g.versions),
        available: g.available,
        unavailableReason: g.unavailableReason,
      })),
    );
  });
}
