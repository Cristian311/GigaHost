"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RESOURCE_LIMITS } from "@/lib/constants";
import { calculatePrice } from "@/lib/pricing/calculate-price";
import type { BillingPeriod, PricingTable } from "@/lib/pricing/types";

export type ConfiguratorGame = {
  slug: string;
  name: string;
  image: string;
  accentColor: string;
  minRamGb: number;
  recommendedRamGb: number;
  minCpu: number;
  minStorageGb: number;
  versions: string[];
  available: boolean;
};

export type ConfiguratorRegion = {
  code: string;
  name: string;
  country: string;
  flag: string;
  priceMultiplier: number;
};

export type ConfiguratorState = {
  gameSlug: string;
  gameVersion: string;
  ramGb: number;
  vcpu: number;
  storageGb: number;
  regionCode: string;
  billingPeriod: BillingPeriod;
  name: string;
};

const PERIODS: BillingPeriod[] = ["MONTHLY", "QUARTERLY", "YEARLY"];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readNumber(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

export function useConfigurator(options: {
  games: ConfiguratorGame[];
  regions: ConfiguratorRegion[];
  pricing: PricingTable;
  initialSearch?: string;
  syncUrl?: boolean;
}) {
  const { games, regions, pricing, initialSearch, syncUrl = false } = options;
  const availableGames = useMemo(() => games.filter((g) => g.available), [games]);

  const [state, setState] = useState<ConfiguratorState>(() => {
    const params = new URLSearchParams(initialSearch ?? "");
    const requestedGame = params.get("game");
    const game =
      availableGames.find((g) => g.slug === requestedGame) ?? availableGames[0];
    const region =
      regions.find((r) => r.code === params.get("region")) ?? regions[0];
    const period = params.get("period")?.toUpperCase();

    return {
      gameSlug: game?.slug ?? "",
      gameVersion: game?.versions[0] ?? "",
      ramGb: clamp(
        readNumber(params, "ram") ?? game?.recommendedRamGb ?? RESOURCE_LIMITS.ram.min,
        game?.minRamGb ?? RESOURCE_LIMITS.ram.min,
        RESOURCE_LIMITS.ram.max,
      ),
      vcpu: clamp(
        readNumber(params, "cpu") ?? Math.max(game?.minCpu ?? 1, 2),
        game?.minCpu ?? RESOURCE_LIMITS.cpu.min,
        RESOURCE_LIMITS.cpu.max,
      ),
      storageGb: clamp(
        readNumber(params, "storage") ?? Math.max(game?.minStorageGb ?? 10, 25),
        game?.minStorageGb ?? RESOURCE_LIMITS.storage.min,
        RESOURCE_LIMITS.storage.max,
      ),
      regionCode: region?.code ?? "",
      billingPeriod: PERIODS.includes(period as BillingPeriod)
        ? (period as BillingPeriod)
        : "MONTHLY",
      name: params.get("name") ?? "",
    };
  });

  const game = useMemo(
    () => games.find((g) => g.slug === state.gameSlug) ?? availableGames[0],
    [games, availableGames, state.gameSlug],
  );
  const region = useMemo(
    () => regions.find((r) => r.code === state.regionCode) ?? regions[0],
    [regions, state.regionCode],
  );

  const breakdown = useMemo(
    () =>
      calculatePrice(
        {
          ramGb: state.ramGb,
          vcpu: state.vcpu,
          storageGb: state.storageGb,
          regionMultiplier: region?.priceMultiplier ?? 1,
          billingPeriod: state.billingPeriod,
        },
        pricing,
      ),
    [state.ramGb, state.vcpu, state.storageGb, state.billingPeriod, region, pricing],
  );

  const update = useCallback(
    (patch: Partial<ConfiguratorState>) => setState((prev) => ({ ...prev, ...patch })),
    [],
  );

  const selectGame = useCallback(
    (slug: string) => {
      const next = games.find((g) => g.slug === slug);
      if (!next || !next.available) return;
      setState((prev) => ({
        ...prev,
        gameSlug: next.slug,
        gameVersion: next.versions[0] ?? "",
        ramGb: clamp(Math.max(prev.ramGb, next.minRamGb), next.minRamGb, RESOURCE_LIMITS.ram.max),
        vcpu: clamp(Math.max(prev.vcpu, next.minCpu), next.minCpu, RESOURCE_LIMITS.cpu.max),
        storageGb: clamp(
          Math.max(prev.storageGb, next.minStorageGb),
          next.minStorageGb,
          RESOURCE_LIMITS.storage.max,
        ),
      }));
    },
    [games],
  );

  // Keep the URL shareable without triggering navigations.
  useEffect(() => {
    if (!syncUrl || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("game", state.gameSlug);
    params.set("ram", String(state.ramGb));
    params.set("cpu", String(state.vcpu));
    params.set("storage", String(state.storageGb));
    params.set("region", state.regionCode);
    params.set("period", state.billingPeriod.toLowerCase());
    if (state.name) params.set("name", state.name);
    else params.delete("name");
    const next = `${window.location.pathname}?${params.toString()}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [syncUrl, state]);

  const limits = {
    ram: { ...RESOURCE_LIMITS.ram, min: game?.minRamGb ?? RESOURCE_LIMITS.ram.min },
    cpu: { ...RESOURCE_LIMITS.cpu, min: game?.minCpu ?? RESOURCE_LIMITS.cpu.min },
    storage: {
      ...RESOURCE_LIMITS.storage,
      min: game?.minStorageGb ?? RESOURCE_LIMITS.storage.min,
    },
  };

  const searchString = useMemo(() => {
    const params = new URLSearchParams({
      game: state.gameSlug,
      ram: String(state.ramGb),
      cpu: String(state.vcpu),
      storage: String(state.storageGb),
      region: state.regionCode,
      period: state.billingPeriod.toLowerCase(),
    });
    return params.toString();
  }, [state]);

  return {
    state,
    update,
    selectGame,
    game,
    region,
    breakdown,
    limits,
    availableGames,
    searchString,
  };
}
