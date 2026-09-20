import { prisma } from "@/lib/db";
import type { Game, PricingConfig } from "@/generated/prisma/client";
import { getServerProviderKind } from "@/lib/env";
import { calculatePrice } from "@/lib/pricing/calculate-price";
import type { PriceBreakdown, PricingTable } from "@/lib/pricing/types";
import type { ServerConfigInput } from "@/lib/validation/server";
import { AppError } from "@/server/errors";
import { isGameProvisionable, isRegionProvisionable } from "@/server/providers/targets";

export function toPricingTable(config: PricingConfig): PricingTable {
  return {
    currency: config.currency,
    basePriceCents: config.basePriceCents,
    pricePerGbRamCents: config.pricePerGbRamCents,
    pricePerVcpuCents: config.pricePerVcpuCents,
    pricePerGbStorageCents: config.pricePerGbStorageCents,
    quarterlyDiscount: config.quarterlyDiscount,
    yearlyDiscount: config.yearlyDiscount,
  };
}

export async function getActivePricing(): Promise<PricingConfig> {
  const pricing = await prisma.pricingConfig.findFirst({
    where: { active: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!pricing) throw new AppError("pricing_missing", 500);
  return pricing;
}

export async function getActiveRegions() {
  return prisma.region.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getGames(options: { onlyAvailable?: boolean } = {}) {
  return prisma.game.findMany({
    where: options.onlyAvailable ? { available: true } : undefined,
    orderBy: { sortOrder: "asc" },
  });
}

export async function getGameBySlug(slug: string) {
  return prisma.game.findUnique({ where: { slug } });
}

/**
 * Data the configurator needs to compute prices client-side. With real
 * provisioning, games and regions without Pterodactyl settings are not offered.
 */
export async function getConfiguratorData() {
  const [games, regions, pricing] = await Promise.all([
    getGames(),
    getActiveRegions(),
    getActivePricing(),
  ]);
  const real = getServerProviderKind() === "pterodactyl";
  return {
    games: real ? games.map((g) => (isGameProvisionable(g) ? g : { ...g, available: false })) : games,
    regions: real ? regions.filter(isRegionProvisionable) : regions,
    pricing: toPricingTable(pricing),
  };
}

export type Quote = {
  breakdown: PriceBreakdown;
  game: NonNullable<Awaited<ReturnType<typeof getGameBySlug>>>;
  region: Awaited<ReturnType<typeof getActiveRegions>>[number];
  pricing: PricingConfig;
};

/** Throws `below_minimum` when a configuration is under the game's requirements. */
export function assertMeetsMinimums(
  game: Pick<Game, "minRamGb" | "minCpu" | "minStorageGb">,
  config: { ramGb: number; vcpu: number; storageGb: number },
) {
  if (
    config.ramGb < game.minRamGb ||
    config.vcpu < game.minCpu ||
    config.storageGb < game.minStorageGb
  ) {
    throw new AppError("below_minimum", 400, undefined, {
      minRamGb: game.minRamGb,
      minCpu: game.minCpu,
      minStorageGb: game.minStorageGb,
    });
  }
}

/**
 * Validates a configuration against the catalog and computes an authoritative
 * price. Used by both the quote endpoint and the checkout, so the client can
 * never submit a tampered total.
 */
export async function quote(input: ServerConfigInput): Promise<Quote> {
  const [game, region, pricing] = await Promise.all([
    getGameBySlug(input.gameSlug),
    prisma.region.findUnique({ where: { code: input.regionCode } }),
    getActivePricing(),
  ]);

  if (!game) throw new AppError("game_not_found", 404);
  if (!game.available) throw new AppError("game_unavailable", 400);
  if (!region || !region.active) throw new AppError("region_not_found", 404);

  if (getServerProviderKind() === "pterodactyl") {
    if (!isGameProvisionable(game)) throw new AppError("game_not_configured", 400);
    if (!isRegionProvisionable(region)) throw new AppError("region_not_configured", 400);
  }

  assertMeetsMinimums(game, input);

  const breakdown = calculatePrice(
    {
      ramGb: input.ramGb,
      vcpu: input.vcpu,
      storageGb: input.storageGb,
      regionMultiplier: region.priceMultiplier,
      billingPeriod: input.billingPeriod,
    },
    toPricingTable(pricing),
  );

  return { breakdown, game, region, pricing };
}
