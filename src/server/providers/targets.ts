import type { Game, Region } from "@/generated/prisma/client";
import type { PterodactylTarget } from "./types";

export function isGameProvisionable(
  game: Pick<Game, "pterodactylNestId" | "pterodactylEggId">,
): boolean {
  return game.pterodactylNestId !== null && game.pterodactylEggId !== null;
}

export function isRegionProvisionable(region: Pick<Region, "pterodactylLocationId">): boolean {
  return region.pterodactylLocationId !== null;
}

/** Parses Game.eggVariables; anything that is not a flat JSON object yields {}. */
export function parseEggVariables(raw: string | null | undefined): Record<string, string> {
  try {
    const value: unknown = JSON.parse(raw || "{}");
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, String(v)]));
  } catch {
    return {};
  }
}

/** Where a game should be deployed on Pterodactyl, or null when not configured. */
export function toPterodactylTarget(game: Game, region: Region): PterodactylTarget | null {
  const { pterodactylNestId: nestId, pterodactylEggId: eggId } = game;
  const locationId = region.pterodactylLocationId;
  if (nestId === null || eggId === null || locationId === null) return null;
  return {
    nestId,
    eggId,
    locationId,
    dockerImage: game.dockerImage,
    versionVariable: game.versionVariable,
    variables: parseEggVariables(game.eggVariables),
  };
}
