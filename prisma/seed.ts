import { hash } from "bcryptjs";
import { prisma } from "../src/lib/db";

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

/** i18n key rendered as "Coming soon" on the site. */
const COMING_SOON = "coming_soon";

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
    available: false,
    unavailableReason: COMING_SOON,
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
    available: false,
    unavailableReason: COMING_SOON,
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
    available: false,
    unavailableReason: COMING_SOON,
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
    available: false,
    unavailableReason: COMING_SOON,
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
    available: false,
    unavailableReason: COMING_SOON,
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
    available: false,
    unavailableReason: COMING_SOON,
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
    available: false,
    unavailableReason: COMING_SOON,
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
    available: false,
    unavailableReason: COMING_SOON,
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
    available: false,
    unavailableReason: COMING_SOON,
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

async function main() {
  console.log("Seeding games…");

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

  console.log("Seeding regions…");
  for (const region of regions) {
    await prisma.region.upsert({
      where: { code: region.code },
      update: region,
      create: region,
    });
  }

  console.log("Seeding pricing…");
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

  console.log("Seeding admin user…");
  const adminEmail = "admin@gigahost.local";
  const passwordHash = await hash("admin1234", 10);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN" },
    create: {
      email: adminEmail,
      name: "GigaHost Admin",
      passwordHash,
      role: "ADMIN",
      emailVerified: new Date(),
    },
  });

  console.log("Done. Admin login: admin@gigahost.local / admin1234");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
