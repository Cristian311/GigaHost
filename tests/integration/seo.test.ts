import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { routing } from "@/i18n/routing";
import { getGames } from "@/server/services/pricing-service";

const BASE = "https://gigahost.test"; // set via vitest.config.mts env

describe("sitemap", () => {
  it("lists every static page in every locale", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    for (const locale of routing.locales) {
      expect(urls).toContain(`${BASE}/${locale}`);
      expect(urls).toContain(`${BASE}/${locale}/games`);
      expect(urls).toContain(`${BASE}/${locale}/configure`);
    }
  });

  it("lists available games and omits the ones that cannot be hosted", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain(`${BASE}/en/games/minecraft-paper`);
    expect(urls).toContain(`${BASE}/ro/games/minecraft-paper`);
    expect(urls).not.toContain(`${BASE}/en/games/roblox`);
  });

  it("declares language alternates for each entry", async () => {
    const entries = await sitemap();
    const home = entries.find((e) => e.url === `${BASE}/en`);
    expect(home?.alternates?.languages).toEqual({
      en: `${BASE}/en`,
      ro: `${BASE}/ro`,
    });
  });

  it("has one entry per locale per page and no duplicates", async () => {
    const entries = await sitemap();
    const games = await getGames({ onlyAvailable: true });
    const expected = (3 + games.length) * routing.locales.length;

    expect(entries).toHaveLength(expected);
    expect(new Set(entries.map((e) => e.url)).size).toBe(expected);
  });
});

describe("robots", () => {
  it("allows the public site and blocks private areas", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;

    expect(rules?.allow).toBe("/");
    expect(rules?.disallow).toEqual(
      expect.arrayContaining(["/api/", "/*/dashboard", "/*/account", "/*/admin"]),
    );
  });

  it("points at the sitemap", () => {
    expect(robots().sitemap).toBe(`${BASE}/sitemap.xml`);
  });
});
