// Standalone script: Next.js is not loading .env for us here.
import "dotenv/config";
import { hash } from "bcryptjs";
import type { PrismaClient } from "../src/generated/prisma/client";

export const ADMIN_EMAIL = "admin@gigahost.local";
export const ADMIN_PASSWORD = "admin1234";

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
};

const games: GameSeed[] = [
  {
    slug: "minecraft-java",
    name: "Minecraft: Java Edition",
    tagline: "Vanilla, Paper, Fabric, Forge – one click.",
    description:
      "Run any Minecraft Java server flavour with instant modpack and plugin support, automatic backups and a full file manager.",
    accentColor: "#22c55e",
    minRamGb: 2,
    recommendedRamGb: 6,
    minCpu: 1,
    minStorageGb: 10,
    versions: ["1.21.8", "1.21.4", "1.20.6", "1.20.1", "1.19.4", "1.18.2", "1.16.5", "1.12.2"],
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
  log("Seeding games…");
  for (const [index, game] of games.entries()) {
    const { versions, available = true, unavailableReason = null, ...rest } = game;
    await prisma.game.upsert({
      where: { slug: game.slug },
      update: {
        ...rest,
        versions: JSON.stringify(versions),
        available,
        unavailableReason,
        image: `/games/${game.slug}.svg`,
        sortOrder: index,
      },
      create: {
        ...rest,
        versions: JSON.stringify(versions),
        available,
        unavailableReason,
        image: `/games/${game.slug}.svg`,
        sortOrder: index,
      },
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

  log("Seeding admin user…");
  const passwordHash = await hash(ADMIN_PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: "ADMIN" },
    create: {
      email: ADMIN_EMAIL,
      name: "GigaHost Admin",
      passwordHash,
      role: "ADMIN",
      emailVerified: new Date(),
    },
  });

  log(`Done. Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
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
