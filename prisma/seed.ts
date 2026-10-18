// Standalone script: Next.js is not loading .env for us here.
import "dotenv/config";
import { hash } from "bcryptjs";
import type { PrismaClient } from "../src/generated/prisma/client";
import { addons } from "./addons";

export const ADMIN_EMAIL = "admin@gigahost.local";
export const ADMIN_PASSWORD = "admin1234";

/**
 * The development admin is a published login, so production must supply its
 * own. Seeding is also the only way to load the catalog, so this refuses to
 * run rather than quietly creating a well-known account on a live database.
 */
function resolveAdminCredentials(): { email: string; password: string; fromEnv: boolean } {
  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (email && password) {
    if (password.length < 12) {
      throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters.");
    }
    return { email, password, fromEnv: true };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed the development admin (" +
        `${ADMIN_EMAIL} / ${ADMIN_PASSWORD}, both public in the README) into a production database. ` +
        "Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD.",
    );
  }

  return { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, fromEnv: false };
}

type GameSeed = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  accentColor: string;
  minRamGb: number;
  recommendedRamGb: number;
  minCpu: number;
  minStorageGb: number;
  versions: string[];
  available?: boolean;
  unavailableReason?: string;
  /** Defaults to /games/<slug>.svg. */
  image?: string;
  /** Provisioning defaults, applied only when the game is first created. */
  versionVariable?: string;
  eggVariables?: Record<string, string>;
};

const MINECRAFT_VERSIONS = [
  "Latest",
  "1.21.8",
  "1.21.4",
  "1.20.6",
  "1.20.4",
  "1.20.1",
  "1.19.4",
  "1.18.2",
  "1.16.5",
  "1.12.2",
];

const PAPER_DEFAULTS = {
  versionVariable: "MINECRAFT_VERSION",
  eggVariables: { SERVER_JARFILE: "server.jar", BUILD_NUMBER: "latest" },
};

const games: GameSeed[] = [
  {
    slug: "minecraft-paper",
    name: "Minecraft: Java (Paper)",
    tagline: "Fast, plugin-ready Java server.",
    description:
      "Paper is a high-performance fork of the official server with Bukkit and Spigot plugin support. Pick any version from 1.12 to the latest release; the right Java version is chosen for you.",
    accentColor: "#22c55e",
    minRamGb: 2,
    recommendedRamGb: 6,
    minCpu: 1,
    minStorageGb: 10,
    versions: MINECRAFT_VERSIONS,
    image: "/games/minecraft-java.svg",
    ...PAPER_DEFAULTS,
  },
  {
    slug: "minecraft-vanilla",
    name: "Minecraft: Java (Vanilla)",
    tagline: "The official server, exactly as Mojang ships it.",
    description:
      "The unmodified Minecraft Java server. Ideal for survival worlds with friends when you do not need plugins.",
    accentColor: "#4ade80",
    minRamGb: 2,
    recommendedRamGb: 4,
    minCpu: 1,
    minStorageGb: 10,
    versions: MINECRAFT_VERSIONS,
    image: "/games/minecraft-java.svg",
    versionVariable: "VANILLA_VERSION",
    eggVariables: { SERVER_JARFILE: "server.jar" },
  },
  {
    slug: "minecraft-bedrock",
    name: "Minecraft: Bedrock Edition",
    tagline: "Cross-play for console, mobile and Windows.",
    description:
      "Official Bedrock Dedicated Server with behaviour packs and cross-platform play for consoles, phones and PC.",
    accentColor: "#84cc16",
    minRamGb: 1,
    recommendedRamGb: 4,
    minCpu: 1,
    minStorageGb: 10,
    versions: ["1.21.90", "1.21.60", "1.20.80"],
  },
  {
    slug: "rust",
    name: "Rust",
    tagline: "Survive, build, raid. Wipe schedules included.",
    description:
      "High-performance Rust servers with Oxide/uMod support, automatic wipe scheduling and DDoS protection.",
    accentColor: "#f97316",
    minRamGb: 8,
    recommendedRamGb: 16,
    minCpu: 3,
    minStorageGb: 40,
    versions: ["Latest", "Staging"],
  },
  {
    slug: "ark-survival-ascended",
    name: "ARK: Survival Ascended",
    tagline: "Tame dinos with your tribe on a private island.",
    description:
      "Dedicated ARK servers with mod support, cluster travel and custom rates you control from the dashboard.",
    accentColor: "#0ea5e9",
    minRamGb: 12,
    recommendedRamGb: 16,
    minCpu: 4,
    minStorageGb: 60,
    versions: ["Latest"],
  },
  {
    slug: "valheim",
    name: "Valheim",
    tagline: "Viking co-op for you and your friends.",
    description:
      "Lightweight Valheim servers with world backups, mod support through BepInEx and instant world uploads.",
    accentColor: "#a855f7",
    minRamGb: 4,
    recommendedRamGb: 8,
    minCpu: 2,
    minStorageGb: 10,
    versions: ["Latest", "Public Test"],
  },
  {
    slug: "cs2",
    name: "Counter-Strike 2",
    tagline: "128-tick competitive servers.",
    description:
      "Counter-Strike 2 servers with SourceMod/MetaMod, custom maps and low-latency locations across Europe and the US.",
    accentColor: "#eab308",
    minRamGb: 4,
    recommendedRamGb: 8,
    minCpu: 2,
    minStorageGb: 40,
    versions: ["Latest"],
  },
  {
    slug: "palworld",
    name: "Palworld",
    tagline: "Catch Pals, build bases, survive together.",
    description:
      "Palworld dedicated servers with editable world settings, scheduled restarts and cloud backups.",
    accentColor: "#38bdf8",
    minRamGb: 8,
    recommendedRamGb: 16,
    minCpu: 4,
    minStorageGb: 20,
    versions: ["Latest"],
  },
  {
    slug: "terraria",
    name: "Terraria",
    tagline: "2D adventure for up to 255 players.",
    description:
      "Vanilla and tModLoader Terraria servers that start in seconds and cost next to nothing.",
    accentColor: "#f43f5e",
    minRamGb: 1,
    recommendedRamGb: 2,
    minCpu: 1,
    minStorageGb: 10,
    versions: ["1.4.5", "1.4.4.9", "tModLoader"],
  },
  {
    slug: "7-days-to-die",
    name: "7 Days to Die",
    tagline: "Zombie survival with blood-moon hordes.",
    description:
      "7 Days to Die servers with full serverconfig.xml editing, mod support and automatic updates.",
    accentColor: "#ef4444",
    minRamGb: 8,
    recommendedRamGb: 12,
    minCpu: 3,
    minStorageGb: 20,
    versions: ["Latest", "Experimental"],
  },
  {
    slug: "satisfactory",
    name: "Satisfactory",
    tagline: "Factory building with friends, 24/7.",
    description:
      "Persistent Satisfactory dedicated servers so your factory keeps running while you sleep.",
    accentColor: "#fb923c",
    minRamGb: 8,
    recommendedRamGb: 12,
    minCpu: 3,
    minStorageGb: 20,
    versions: ["Latest", "Experimental"],
  },
  {
    slug: "roblox",
    name: "Roblox",
    tagline: "Not available for rental.",
    description:
      "Roblox experiences are hosted exclusively on Roblox's own infrastructure. Third-party hosting is not supported by the platform.",
    accentColor: "#64748b",
    minRamGb: 1,
    recommendedRamGb: 1,
    minCpu: 1,
    minStorageGb: 10,
    versions: [],
    available: false,
    unavailableReason:
      "Roblox does not allow self-hosted or third-party game servers.",
  },
];

const regions = [
  { code: "eu-ro", name: "Bucharest", country: "Romania", flag: "🇷🇴", priceMultiplier: 1.0, sortOrder: 0 },
  { code: "eu-de", name: "Frankfurt", country: "Germany", flag: "🇩🇪", priceMultiplier: 1.05, sortOrder: 1 },
  { code: "eu-uk", name: "London", country: "United Kingdom", flag: "🇬🇧", priceMultiplier: 1.1, sortOrder: 2 },
  { code: "us-east", name: "New York", country: "United States", flag: "🇺🇸", priceMultiplier: 1.15, sortOrder: 3 },
];

/** Idempotent seed used by `prisma db seed` and by the integration test setup. */
export async function seed(prisma: PrismaClient, options: { log?: boolean } = {}) {
  const log = options.log === false ? () => {} : console.log;
  // Resolved first so a misconfigured production run fails before it writes
  // anything, rather than after seeding the whole catalog.
  const admin = resolveAdminCredentials();
  log("Seeding games…");

  // Earlier seeds had a single "minecraft-java" game. Rename it to Paper so
  // existing servers keep pointing at a valid game.
  const legacy = await prisma.game.findUnique({ where: { slug: "minecraft-java" } });
  const paper = await prisma.game.findUnique({ where: { slug: "minecraft-paper" } });
  if (legacy && !paper) {
    await prisma.game.update({
      where: { id: legacy.id },
      data: {
        slug: "minecraft-paper",
        versionVariable: PAPER_DEFAULTS.versionVariable,
        eggVariables: JSON.stringify(PAPER_DEFAULTS.eggVariables),
      },
    });
  }

  for (const [index, game] of games.entries()) {
    const {
      versions,
      available = true,
      unavailableReason = null,
      image,
      versionVariable = null,
      eggVariables = {},
      ...rest
    } = game;
    const catalog = {
      ...rest,
      versions: JSON.stringify(versions),
      available,
      unavailableReason,
      image: image ?? `/games/${game.slug}.svg`,
      sortOrder: index,
    };
    await prisma.game.upsert({
      where: { slug: game.slug },
      update: catalog,
      // Pterodactyl settings are only defaults: admins tune them in /admin/games.
      create: { ...catalog, versionVariable, eggVariables: JSON.stringify(eggVariables) },
    });
  }

  log("Seeding regions…");
  for (const region of regions) {
    await prisma.region.upsert({
      where: { code: region.code },
      update: region,
      create: region,
    });
  }

  log("Seeding pricing…");
  const existingPricing = await prisma.pricingConfig.findFirst({ where: { active: true } });
  if (!existingPricing) {
    await prisma.pricingConfig.create({
      data: {
        name: "default",
        active: true,
        currency: "EUR",
        basePriceCents: 200,
        pricePerGbRamCents: 150,
        pricePerVcpuCents: 200,
        pricePerGbStorageCents: 10,
        quarterlyDiscount: 0.05,
        yearlyDiscount: 0.15,
      },
    });
  }

  log("Seeding coupons…");
  await prisma.coupon.upsert({
    where: { code: "WELCOME10" },
    update: {},
    create: { code: "WELCOME10", kind: "PERCENT", value: 10, perUserLimit: 1 },
  });

  log("Seeding add-ons…");
  for (const addon of addons) {
    const { games: addonGames, ...rest } = addon;
    const data = { ...rest, gameSlugs: JSON.stringify(addonGames) };
    await prisma.addon.upsert({ where: { slug: addon.slug }, update: data, create: data });
  }

  log("Seeding admin user…");
  const passwordHash = await hash(admin.password, 10);
  await prisma.user.upsert({
    where: { email: admin.email },
    update: { role: "ADMIN" },
    create: {
      email: admin.email,
      name: "GigaHost Admin",
      passwordHash,
      role: "ADMIN",
      emailVerified: new Date(),
    },
  });

  log(
    admin.fromEnv
      ? `Done. Admin: ${admin.email} (password from SEED_ADMIN_PASSWORD).`
      : `Done. Admin login: ${admin.email} / ${admin.password}`,
  );
}

// Run directly via `prisma db seed` / `tsx prisma/seed.ts`; skipped when imported by tests.
const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/seed.ts");
if (isDirectRun) {
  import("../src/lib/db").then(async ({ prisma }) => {
    try {
      await seed(prisma);
    } catch (error) {
      console.error(error);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  });
}
