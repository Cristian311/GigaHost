import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";

export const alt = "GigaHost — game server hosting";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing.hero" });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #0a0a12 0%, #1a1033 55%, #0d2436 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "linear-gradient(135deg, #8b5cf6, #22d3ee)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 38,
            }}
          >
            ⚡
          </div>
          <div style={{ fontSize: 44, fontWeight: 700 }}>GigaHost</div>
        </div>

        <div
          style={{
            marginTop: 48,
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.05,
            maxWidth: 900,
            display: "flex",
          }}
        >
          {`${t("title1")} ${t("title2")}`}
        </div>

        <div
          style={{
            marginTop: 28,
            fontSize: 30,
            color: "#b9b6d6",
            maxWidth: 900,
            display: "flex",
          }}
        >
          {t("badge")}
        </div>
      </div>
    ),
    size,
  );
}
