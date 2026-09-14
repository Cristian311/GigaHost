import type { Game, Region } from "@/generated/prisma/client";
import type {
  ConfiguratorGame,
  ConfiguratorRegion,
} from "@/components/configurator/use-configurator";
import { parseVersions } from "./games";

/** Strips DB rows down to the serializable shape the client configurator needs. */
export function toConfiguratorGames(games: Game[]): ConfiguratorGame[] {
  return games.map((g) => ({
    slug: g.slug,
    name: g.name,
    image: g.image,
    accentColor: g.accentColor,
    minRamGb: g.minRamGb,
    recommendedRamGb: g.recommendedRamGb,
    minCpu: g.minCpu,
    minStorageGb: g.minStorageGb,
    versions: parseVersions(g.versions),
    available: g.available,
  }));
}

export function toConfiguratorRegions(regions: Region[]): ConfiguratorRegion[] {
  return regions.map((r) => ({
    code: r.code,
    name: r.name,
    country: r.country,
    flag: r.flag,
    priceMultiplier: r.priceMultiplier,
  }));
}
