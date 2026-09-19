import { ImageResponse } from "next/og";
import { calculatePrice, formatMoney } from "@/lib/pricing/calculate-price";
import { getActivePricing, getGameBySlug, toPricingTable } from "@/server/services/pricing-service";

export const alt = "GigaHost game server";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function GameOpenGraphImage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const [game, pricing] = await Promise.all([getGameBySlug(slug), getActivePricing()]);

  const name = game?.name ?? "GigaHost";
  const tagline = game?.tagline ?? "Game server hosting";
  const accent = game?.accentColor ?? "#8b5cf6";

  const from = game
    ? formatMoney(
        calculatePrice(
          {
            ramGb: game.minRamGb,
            vcpu: game.minCpu,
            storageGb: game.minStorageGb,
            regionMultiplier: 1,
            billingPeriod: "MONTHLY",
          },
          toPricingTable(pricing),
        ).monthlyCents,
        pricing.currency,
        locale,
      )
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background: `linear-gradient(135deg, #0a0a12 0%, ${accent}55 60%, #0a0a12 100%)`,
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 34, fontWeight: 700 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "linear-gradient(135deg, #8b5cf6, #22d3ee)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
            }}
          >
            ⚡
          </div>
          GigaHost
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05, display: "flex" }}>
            {name}
          </div>
          <div style={{ marginTop: 20, fontSize: 32, color: "#c9c6e4", display: "flex" }}>
            {tagline}
          </div>
        </div>

        {from ? (
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, fontSize: 36 }}>
            <span style={{ color: "#b9b6d6" }}>from</span>
            <span style={{ fontSize: 56, fontWeight: 800 }}>{from}</span>
            <span style={{ color: "#b9b6d6" }}>/mo</span>
          </div>
        ) : (
          <div style={{ fontSize: 32, color: "#b9b6d6", display: "flex" }}>gigahost.dev</div>
        )}
      </div>
    ),
    size,
  );
}
