import type { Metadata } from "next";
import { routing } from "@/i18n/routing";

/**
 * Canonical and hreflang for one page.
 *
 * The root layout sets these for `/{locale}`, and metadata is merged rather
 * than inherited field by field: a page that does not set `alternates` keeps
 * the layout's, so every page would otherwise declare the home page as its
 * canonical and ask search engines to drop it from the index.
 *
 * `path` is the route below the locale, with a leading slash ("/games") or
 * empty for the home page.
 */
export function alternates(locale: string, path = ""): Metadata["alternates"] {
  const suffix = path && !path.startsWith("/") ? `/${path}` : path;
  return {
    canonical: `/${locale}${suffix}`,
    languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}${suffix}`])),
  };
}
