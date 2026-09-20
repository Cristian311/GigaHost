import { MOCK_TIMINGS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { ancestorsOf, baseName, joinPath, parentOf } from "@/lib/files/path";
import { AppError } from "@/server/errors";
import { defaultFiles, type SeedContext } from "./mock-files";
import type {
  AddonFile,
  BackupResult,
  ConsoleAccess,
  ConsoleLine,
  FileEntry,
  PlayerInfo,
  PlayerList,
  ProviderStatus,
  ProvisionInput,
  ProvisionResult,
  ResourceUsage,
  ServerProvider,
  ServerRef,
} from "./types";

const MAX_PLAYERS = 20;
const PLAYER_NAMES = [
  "Steve",
  "Alex",
  "Nova",
  "Pixel",
  "Kratos",
  "Luna",
  "Zed",
  "Mira",
  "Orion",
  "Vex",
  "Juno",
  "Rook",
];
/** A kicked player stays away this long before the simulation lets them back. */
const KICK_MS = 10 * 60_000;

/** Provider ids are "mock_<serverId>"; the mock keeps its state under the server id. */
const serverIdOf = (ref: ServerRef) => ref.providerId.replace(/^mock_/, "");
const byteLength = (text: string) => Buffer.byteLength(text, "utf8");

type Reply = { level: ConsoleLine["level"]; text: string };
const info = (text: string): Reply => ({ level: "info", text });
const error = (text: string): Reply => ({ level: "error", text });

/** Small deterministic PRNG so the mock output is stable per server. */
function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REGION_IP_PREFIX: Record<string, string> = {
  "eu-ro": "185.12",
  "eu-de": "116.203",
  "eu-uk": "178.62",
  "us-east": "159.65",
};

/**
 * Simulated provisioning backend.
 *
 * State transitions are computed lazily from `statusChangedAt` rather than
 * with timers, so they work in serverless environments and across restarts:
 *   INSTALLING --10s--> STOPPED
 *   STARTING   --5s---> RUNNING
 *   STOPPING   --3s---> STOPPED
 */
export class MockProvider implements ServerProvider {
  readonly name = "mock";

  async createServer(input: ProvisionInput): Promise<ProvisionResult> {
    const rand = mulberry32(hashString(input.serverId));
    const prefix = REGION_IP_PREFIX[input.regionCode] ?? "10.0";
    const ip = `${prefix}.${Math.floor(rand() * 200) + 10}.${Math.floor(rand() * 200) + 10}`;
    const port = 25000 + Math.floor(rand() * 5000);
    await this.seedFiles(input.serverId, {
      name: input.name,
      gameSlug: input.gameSlug,
      gameVersion: input.gameVersion ?? null,
      port,
      maxPlayers: MAX_PLAYERS,
    });
    return {
      providerId: `mock_${input.serverId}`,
      identifier: null,
      internalId: null,
      ip,
      port,
    };
  }

  async deleteServer(): Promise<void> {
    // Nothing to tear down in the simulation.
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async restart(): Promise<void> {}
  async suspend(): Promise<void> {}
  async unsuspend(): Promise<void> {}

  async getConsoleAccess(): Promise<ConsoleAccess | null> {
    return null;
  }

  async createBackup(ref: ServerRef, name: string): Promise<BackupResult> {
    const rand = mulberry32(hashString(`${ref.providerId}:${name}:${Date.now()}`));
    // Between roughly 3 % and 12 % of the disk, deterministic per request.
    const sizeMb = Math.max(
      12,
      Math.round(ref.storageGb * 1024 * (0.03 + rand() * 0.09)),
    );
    return { providerBackupId: `mockbk_${Math.floor(rand() * 1e9).toString(36)}`, sizeMb };
  }

  async restoreBackup(): Promise<void> {}
  async deleteBackup(): Promise<void> {}

  async getStatus(ref: ServerRef): Promise<ProviderStatus> {
    const elapsed = Date.now() - ref.statusChangedAt.getTime();
    switch (ref.status) {
      case "INSTALLING":
        return elapsed >= MOCK_TIMINGS.installing ? "STOPPED" : "INSTALLING";
      case "STARTING":
        return elapsed >= MOCK_TIMINGS.starting ? "RUNNING" : "STARTING";
      case "STOPPING":
        return elapsed >= MOCK_TIMINGS.stopping ? "STOPPED" : "STOPPING";
      default:
        return ref.status;
    }
  }

  async getUsage(ref: ServerRef): Promise<ResourceUsage> {
    const running = ref.status === "RUNNING";
    const ramTotalMb = ref.ramGb * 1024;
    const diskTotalMb = ref.storageGb * 1024;
    const seed = hashString(ref.providerId);
    const now = Date.now();
    const uptimeSec = running
      ? Math.max(0, Math.floor((now - ref.statusChangedAt.getTime()) / 1000))
      : 0;

    // Disk usage grows slowly with uptime, deterministic per server.
    const baseDisk = 0.12 + (seed % 20) / 100;
    const diskUsedMb = Math.min(
      diskTotalMb,
      Math.floor(diskTotalMb * baseDisk + uptimeSec * 0.05),
    );

    const history: ResourceUsage["history"] = [];
    const points = 30;
    for (let i = points - 1; i >= 0; i--) {
      const t = now - i * 10_000;
      const bucket = Math.floor(t / 10_000);
      const rand = mulberry32(seed ^ bucket);
      const cpuPct = running ? Math.round(18 + rand() * 40 + Math.sin(bucket / 4) * 8) : 0;
      const ramUsedMb = running
        ? Math.round(ramTotalMb * (0.35 + rand() * 0.25))
        : 0;
      history.push({ t, cpuPct: Math.max(0, Math.min(100, cpuPct)), ramUsedMb });
    }

    const last = history[history.length - 1];
    // Same source as the player list, so the tile and the list always agree.
    const players = (await this.getPlayers(ref)).online;

    return {
      cpuPct: last.cpuPct,
      ramUsedMb: last.ramUsedMb,
      ramTotalMb,
      diskUsedMb,
      diskTotalMb,
      players,
      uptimeSec,
      history,
    };
  }

  async getConsoleLines(ref: ServerRef, limit = 60): Promise<ConsoleLine[]> {
    const lines: ConsoleLine[] = [];
    const startedAt = ref.statusChangedAt.getTime();
    const push = (offsetMs: number, level: ConsoleLine["level"], text: string) =>
      lines.push({ ts: new Date(startedAt + offsetMs).toISOString(), level, text });

    if (ref.status === "INSTALLING") {
      push(0, "info", "Provisioning container on node…");
      push(1500, "info", "Pulling game image…");
      push(4000, "info", "Downloading server files (this may take a moment)…");
      push(7000, "info", "Writing default configuration…");
      return lines.slice(-limit);
    }

    if (ref.status === "STOPPED") {
      push(0, "info", "Server process exited with code 0.");
      push(10, "info", "Container is idle. Press Start to boot the server.");
      return lines.slice(-limit);
    }

    if (ref.status === "STOPPING") {
      push(0, "info", "Received stop signal, saving world…");
      push(800, "info", "Saving chunks for level 'world'…");
      return lines.slice(-limit);
    }

    push(0, "info", "Starting server process…");
    push(400, "info", `Allocated ${ref.ramGb}G heap (-Xmx${ref.ramGb}G).`);
    push(1200, "info", "Loading libraries, please wait…");
    push(2500, "info", "Preparing level 'world'…");
    push(4200, "info", "Preparing spawn area: 100%");
    push(4800, "info", "Done (4.7s)! For help, type \"help\"");

    if (ref.status === "RUNNING") {
      const seed = hashString(ref.providerId);
      const rand = mulberry32(seed);
      const names = ["Steve", "Alex", "Nova", "Pixel", "Kratos", "Luna", "Zed", "Mira"];
      const elapsed = Date.now() - startedAt;
      let t = 6000;
      let i = 0;
      while (t < elapsed && i < 200) {
        const name = names[Math.floor(rand() * names.length)];
        const roll = rand();
        if (roll < 0.35) push(t, "info", `${name} joined the game`);
        else if (roll < 0.55) push(t, "info", `<${name}> gg`);
        else if (roll < 0.7) push(t, "info", `${name} left the game`);
        else if (roll < 0.85) push(t, "info", "Saved the game");
        else if (roll < 0.95) push(t, "warn", "Can't keep up! Is the server overloaded? Running 2043ms behind.");
        else push(t, "info", "Automatic backup completed (12.4 MB)");
        t += 15_000 + Math.floor(rand() * 45_000);
        i++;
      }

      // What the customer typed, and what the server answered, since it booted.
      const entries = await prisma.consoleEntry.findMany({
        where: { serverId: serverIdOf(ref), createdAt: { gte: ref.statusChangedAt } },
        orderBy: { createdAt: "asc" },
        take: 200,
      });
      for (const entry of entries) {
        lines.push({
          ts: entry.createdAt.toISOString(),
          level: entry.level as ConsoleLine["level"],
          text: entry.kind === "COMMAND" ? `> ${entry.text}` : entry.text,
        });
      }
      lines.sort((a, b) => a.ts.localeCompare(b.ts));
    }

    return lines.slice(-limit);
  }

  // --- players ---------------------------------------------------------------------

  async getPlayers(ref: ServerRef): Promise<PlayerList> {
    if (ref.status !== "RUNNING") return { online: 0, max: MAX_PLAYERS, players: [] };

    const seed = hashString(ref.providerId);
    const now = Date.now();
    // How many are on changes every minute; who they are is a stable ordering
    // per server, so the list does not reshuffle while someone is looking at it.
    const count = Math.floor(mulberry32(seed ^ Math.floor(now / 60_000))() * PLAYER_NAMES.length);
    const order = mulberry32(seed);
    const roster = PLAYER_NAMES.map((name) => ({ name, key: order() }))
      .sort((a, b) => a.key - b.key)
      .map((entry) => entry.name);

    const kicked = await this.recentlyKicked(ref);
    const startedAt = ref.statusChangedAt.getTime();
    const players: PlayerInfo[] = roster
      .slice(0, count)
      .filter((name) => !kicked.has(name.toLowerCase()))
      .map((name) => {
        const rand = mulberry32(hashString(`${ref.providerId}:${name}`));
        const joinedAt = Math.min(now, startedAt + 6000 + Math.floor(rand() * 600_000));
        return {
          name,
          joinedAt: new Date(joinedAt).toISOString(),
          pingMs: 18 + Math.floor(rand() * 90),
        };
      });

    return { online: players.length, max: MAX_PLAYERS, players };
  }

  private async recentlyKicked(ref: ServerRef): Promise<Set<string>> {
    const since = new Date(Math.max(Date.now() - KICK_MS, ref.statusChangedAt.getTime()));
    const commands = await prisma.consoleEntry.findMany({
      where: { serverId: serverIdOf(ref), kind: "COMMAND", createdAt: { gte: since } },
      select: { text: true },
    });
    const names = new Set<string>();
    for (const { text } of commands) {
      const match = text.match(/^\/?(?:kick|ban)\s+(\S+)/i);
      if (match) names.add(match[1].toLowerCase());
    }
    return names;
  }

  // --- console ---------------------------------------------------------------------

  async sendCommand(ref: ServerRef, command: string): Promise<void> {
    if (ref.status !== "RUNNING") throw new AppError("server_not_running", 409);

    const serverId = serverIdOf(ref);
    // Answered before the command is stored: "kick Steve" has to find Steve
    // still online, and storing it first would already have removed him.
    const replies = await this.respondTo(ref, command);
    const now = Date.now();
    await prisma.consoleEntry.createMany({
      data: [
        { serverId, kind: "COMMAND", level: "info", text: command, createdAt: new Date(now) },
        ...replies.map((reply, index) => ({
          serverId,
          kind: "OUTPUT" as const,
          level: reply.level,
          text: reply.text,
          // A millisecond apart, so they keep their order when sorted by time.
          createdAt: new Date(now + index + 1),
        })),
      ],
    });
  }

  private async respondTo(ref: ServerRef, raw: string): Promise<Reply[]> {
    const [name = "", ...args] = raw.replace(/^\//, "").trim().split(/\s+/);
    const verb = name.toLowerCase();
    const rest = args.join(" ");

    switch (verb) {
      case "help":
        return [
          info(
            "Commands: help, list, say <message>, kick <player>, ban <player>, op <player>, deop <player>, whitelist add|remove <player>, save-all, time set <day|night>, weather <clear|rain|thunder>",
          ),
        ];
      case "list": {
        const { online, max, players } = await this.getPlayers(ref);
        const names = players.map((player) => player.name).join(", ");
        return [
          info(`There are ${online} of a max of ${max} players online${names ? `: ${names}` : ""}`),
        ];
      }
      case "say":
        return rest ? [info(`[Server] ${rest}`)] : [error("Usage: say <message>")];
      case "kick":
      case "ban": {
        if (!args[0]) return [error(`Usage: ${verb} <player>`)];
        const { players } = await this.getPlayers(ref);
        const target = players.find((p) => p.name.toLowerCase() === args[0].toLowerCase());
        if (!target) return [error("No player was found")];
        return [
          info(
            verb === "kick"
              ? `Kicked ${target.name}: Kicked by an operator`
              : `Banned ${target.name}: Banned by an operator`,
          ),
        ];
      }
      case "op":
        return args[0] ? [info(`Made ${args[0]} a server operator`)] : [error("Usage: op <player>")];
      case "deop":
        return args[0]
          ? [info(`Made ${args[0]} no longer a server operator`)]
          : [error("Usage: deop <player>")];
      case "whitelist": {
        if (!args[0] || !args[1]) return [error("Usage: whitelist add|remove <player>")];
        return [
          info(
            args[0] === "remove"
              ? `Removed ${args[1]} from the whitelist`
              : `Added ${args[1]} to the whitelist`,
          ),
        ];
      }
      case "save-all":
        return [info("Saving the game (this may take a moment!)"), info("Saved the game")];
      case "time":
        return [info(`Set the time to ${args[1] ?? "day"}`)];
      case "weather":
        return [info(`Set the weather to ${args[0] ?? "clear"}`)];
      default:
        return [
          error("Unknown or incomplete command, see below for error"),
          error(`${raw}<--[HERE]`),
        ];
    }
  }

  // --- files -----------------------------------------------------------------------

  private async seedFiles(serverId: string, ctx: SeedContext) {
    await prisma.serverFile.createMany({
      data: defaultFiles(ctx).map((file) => ({
        serverId,
        path: file.path,
        isDirectory: "isDirectory" in file,
        isBinary: "isBinary" in file,
        content: "content" in file ? file.content : null,
        sizeBytes:
          "content" in file ? byteLength(file.content) : "sizeBytes" in file ? file.sizeBytes : 0,
      })),
      skipDuplicates: true,
    });
  }

  /** Servers created before the file manager existed get their files on first use. */
  private async ensureSeeded(ref: ServerRef) {
    const serverId = serverIdOf(ref);
    if ((await prisma.serverFile.count({ where: { serverId } })) > 0) return;
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      include: { game: { select: { slug: true } } },
    });
    if (!server) return;
    await this.seedFiles(serverId, {
      name: server.name,
      gameSlug: server.game.slug,
      gameVersion: server.gameVersion,
      port: server.port ?? 25565,
      maxPlayers: MAX_PLAYERS,
    });
  }

  private async requireDirectory(serverId: string, directory: string) {
    if (directory === "") return;
    const entry = await prisma.serverFile.findUnique({
      where: { serverId_path: { serverId, path: directory } },
    });
    if (!entry) throw new AppError("file_not_found", 404);
    if (!entry.isDirectory) throw new AppError("not_a_directory", 400);
  }

  async listFiles(ref: ServerRef, directory: string): Promise<FileEntry[]> {
    await this.ensureSeeded(ref);
    const serverId = serverIdOf(ref);
    await this.requireDirectory(serverId, directory);

    const rows = await prisma.serverFile.findMany({
      where: { serverId, ...(directory ? { path: { startsWith: `${directory}/` } } : {}) },
    });
    return rows
      .filter((row) => parentOf(row.path) === directory)
      .map((row) => ({
        name: baseName(row.path),
        path: row.path,
        isDirectory: row.isDirectory,
        isBinary: row.isBinary,
        sizeBytes: row.sizeBytes,
        updatedAt: row.updatedAt,
      }))
      .sort((a, b) =>
        a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1,
      );
  }

  async readFile(ref: ServerRef, path: string): Promise<string> {
    await this.ensureSeeded(ref);
    const entry = await prisma.serverFile.findUnique({
      where: { serverId_path: { serverId: serverIdOf(ref), path } },
    });
    if (!entry) throw new AppError("file_not_found", 404);
    if (entry.isDirectory || entry.isBinary) throw new AppError("file_not_editable", 400);
    return entry.content ?? "";
  }

  async writeFile(ref: ServerRef, path: string, content: string): Promise<void> {
    await this.ensureSeeded(ref);
    const serverId = serverIdOf(ref);
    if (!path) throw new AppError("invalid_path", 400);
    await this.requireDirectory(serverId, parentOf(path));

    const existing = await prisma.serverFile.findUnique({
      where: { serverId_path: { serverId, path } },
    });
    if (existing?.isDirectory || existing?.isBinary) throw new AppError("file_not_editable", 400);

    await prisma.serverFile.upsert({
      where: { serverId_path: { serverId, path } },
      create: { serverId, path, content, sizeBytes: byteLength(content) },
      update: { content, sizeBytes: byteLength(content) },
    });
  }

  async createDirectory(ref: ServerRef, path: string): Promise<void> {
    await this.ensureSeeded(ref);
    const serverId = serverIdOf(ref);
    if (!path) throw new AppError("invalid_path", 400);
    await this.requireDirectory(serverId, parentOf(path));

    const existing = await prisma.serverFile.findUnique({
      where: { serverId_path: { serverId, path } },
    });
    if (existing) throw new AppError("path_exists", 409);
    await prisma.serverFile.create({ data: { serverId, path, isDirectory: true } });
  }

  async deletePath(ref: ServerRef, path: string): Promise<void> {
    await this.ensureSeeded(ref);
    if (!path) throw new AppError("invalid_path", 400, "The server root cannot be deleted.");

    const { count } = await prisma.serverFile.deleteMany({
      // The trailing slash matters: deleting "world" must not take "world_nether".
      where: {
        serverId: serverIdOf(ref),
        OR: [{ path }, { path: { startsWith: `${path}/` } }],
      },
    });
    if (count === 0) throw new AppError("file_not_found", 404);
  }

  // --- add-ons ---------------------------------------------------------------------

  async installAddon(ref: ServerRef, addon: AddonFile): Promise<void> {
    await this.ensureSeeded(ref);
    const serverId = serverIdOf(ref);
    const path = joinPath(addon.installDir, addon.fileName);

    // The install folder may have been deleted by the customer; put it back.
    for (const directory of ancestorsOf(path)) {
      await prisma.serverFile.upsert({
        where: { serverId_path: { serverId, path: directory } },
        create: { serverId, path: directory, isDirectory: true },
        update: {},
      });
    }
    await prisma.serverFile.upsert({
      where: { serverId_path: { serverId, path } },
      create: { serverId, path, isBinary: true, sizeBytes: addon.sizeKb * 1024 },
      update: { isBinary: true, sizeBytes: addon.sizeKb * 1024 },
    });
  }

  async uninstallAddon(ref: ServerRef, addon: AddonFile): Promise<void> {
    await prisma.serverFile.deleteMany({
      where: { serverId: serverIdOf(ref), path: joinPath(addon.installDir, addon.fileName) },
    });
  }
}
