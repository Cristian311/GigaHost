import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { getGames } from "@/server/services/pricing-service";

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Public, indexable paths (without the locale prefix). */
const STATIC_PATHS = ["", "/games", "/configure"] as const;

function urlFor(locale: string, path: string) {
  return `${BASE_URL}/${locale}${path}`;
}

/** Maps a path to its per-locale alternates, as Google expects. */
function alternates(path: string) {
  return {
    languages: Object.fromEntries(
      routing.locales.map((locale) => [locale, urlFor(locale, path)]),
    ),
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const games = await getGames({ onlyAvailable: true });
  const gamePaths = games.map((game) => `/games/${game.slug}`);
  const lastModified = new Date();

  const entries: MetadataRoute.Sitemap = [];

  for (const path of STATIC_PATHS) {
    for (const locale of routing.locales) {
      entries.push({
        url: urlFor(locale, path),
        lastModified,
        changeFrequency: path === "" ? "weekly" : "monthly",
        priority: path === "" ? 1 : 0.8,
        alternates: alternates(path),
      });
    }
  }

  for (const path of gamePaths) {
    for (const locale of routing.locales) {
      entries.push({
        url: urlFor(locale, path),
        lastModified,
        changeFrequency: "monthly",
        priority: 0.6,
        alternates: alternates(path),
      });
    }
  }

  return entries;
}
