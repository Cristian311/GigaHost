/**
 * What a freshly installed server looks like on disk, per game. Only the mock
 * provider uses this; a real node has real files.
 */

export type SeedFile =
  | { path: string; isDirectory: true }
  | { path: string; content: string }
  | { path: string; isBinary: true; sizeBytes: number };

export type SeedContext = {
  name: string;
  gameSlug: string;
  gameVersion: string | null;
  port: number;
  maxPlayers: number;
};

const LOG = (ctx: SeedContext) =>
  [
    "[00:00:00] [Server thread/INFO]: Starting server",
    `[00:00:00] [Server thread/INFO]: Server port: ${ctx.port}`,
    "[00:00:01] [Server thread/INFO]: Preparing level",
    "[00:00:04] [Server thread/INFO]: Done",
    "",
  ].join("\n");

function minecraftJava(ctx: SeedContext): SeedFile[] {
  return [
    {
      path: "server.properties",
      content: [
        "#Minecraft server properties",
        `motd=${ctx.name}`,
        `server-port=${ctx.port}`,
        `max-players=${ctx.maxPlayers}`,
        "gamemode=survival",
        "difficulty=normal",
        "pvp=true",
        "online-mode=true",
        "white-list=false",
        "view-distance=10",
        "simulation-distance=10",
        "spawn-protection=16",
        "allow-flight=false",
        "enable-command-block=false",
        "level-name=world",
        "level-seed=",
        "",
      ].join("\n"),
    },
    {
      path: "eula.txt",
      content:
        "#By changing the setting below to TRUE you are indicating your agreement to the Minecraft EULA (https://aka.ms/MinecraftEULA).\neula=true\n",
    },
    { path: "ops.json", content: "[]\n" },
    { path: "whitelist.json", content: "[]\n" },
    { path: "banned-players.json", content: "[]\n" },
    { path: "banned-ips.json", content: "[]\n" },
    { path: "plugins", isDirectory: true },
    { path: "logs", isDirectory: true },
    { path: "logs/latest.log", content: LOG(ctx) },
    { path: "world", isDirectory: true },
    { path: "world/level.dat", isBinary: true, sizeBytes: 2_481 },
    { path: "world/region", isDirectory: true },
    { path: "world/region/r.0.0.mca", isBinary: true, sizeBytes: 4_820_992 },
    {
      path: `server-${ctx.gameVersion ?? "latest"}.jar`,
      isBinary: true,
      sizeBytes: 51_204_300,
    },
  ];
}

function minecraftBedrock(ctx: SeedContext): SeedFile[] {
  return [
    {
      path: "server.properties",
      content: [
        `server-name=${ctx.name}`,
        `server-port=${ctx.port}`,
        `max-players=${ctx.maxPlayers}`,
        "gamemode=survival",
        "difficulty=normal",
        "allow-cheats=false",
        "online-mode=true",
        "allow-list=false",
        "view-distance=32",
        "level-name=Bedrock level",
        "",
      ].join("\n"),
    },
    { path: "allowlist.json", content: "[]\n" },
    { path: "permissions.json", content: "[]\n" },
    { path: "behavior_packs", isDirectory: true },
    { path: "resource_packs", isDirectory: true },
    { path: "worlds", isDirectory: true },
    { path: "bedrock_server", isBinary: true, sizeBytes: 148_332_544 },
  ];
}

function rust(ctx: SeedContext): SeedFile[] {
  return [
    { path: "server", isDirectory: true },
    { path: "server/cfg", isDirectory: true },
    {
      path: "server/cfg/server.cfg",
      content: [
        `server.hostname "${ctx.name}"`,
        `server.port ${ctx.port}`,
        `server.maxplayers ${ctx.maxPlayers}`,
        "server.worldsize 3500",
        "server.seed 12345",
        "server.saveinterval 300",
        'server.description "Hosted on GigaHost"',
        "",
      ].join("\n"),
    },
    { path: "server/cfg/users.cfg", content: "" },
    { path: "oxide", isDirectory: true },
    { path: "oxide/plugins", isDirectory: true },
    { path: "oxide/config", isDirectory: true },
    { path: "RustDedicated", isBinary: true, sizeBytes: 78_530_048 },
  ];
}

function valheim(ctx: SeedContext): SeedFile[] {
  return [
    {
      path: "start_server.sh",
      content: [
        "#!/bin/bash",
        "export LD_LIBRARY_PATH=./linux64:$LD_LIBRARY_PATH",
        `./valheim_server.x86_64 -name "${ctx.name}" -port ${ctx.port} -world "Dedicated" -password "changeme" -public 1`,
        "",
      ].join("\n"),
    },
    { path: "adminlist.txt", content: "// List admin players ID ONE per line\n" },
    { path: "bannedlist.txt", content: "// List banned players ID ONE per line\n" },
    { path: "permittedlist.txt", content: "// List permitted players ID ONE per line\n" },
    { path: "BepInEx", isDirectory: true },
    { path: "BepInEx/plugins", isDirectory: true },
    { path: "worlds_local", isDirectory: true },
    { path: "valheim_server.x86_64", isBinary: true, sizeBytes: 24_117_248 },
  ];
}

function sourceEngine(ctx: SeedContext): SeedFile[] {
  return [
    { path: "game", isDirectory: true },
    { path: "game/csgo", isDirectory: true },
    { path: "game/csgo/cfg", isDirectory: true },
    {
      path: "game/csgo/cfg/server.cfg",
      content: [
        `hostname "${ctx.name}"`,
        `sv_maxplayers ${ctx.maxPlayers}`,
        'rcon_password ""',
        "sv_cheats 0",
        "mp_autoteambalance 1",
        "mp_roundtime 1.92",
        "",
      ].join("\n"),
    },
    { path: "game/csgo/addons", isDirectory: true },
    { path: "game/csgo/maps", isDirectory: true },
  ];
}

function generic(ctx: SeedContext): SeedFile[] {
  return [
    { path: "config", isDirectory: true },
    {
      path: "config/server.cfg",
      content: [
        `name=${ctx.name}`,
        `port=${ctx.port}`,
        `max_players=${ctx.maxPlayers}`,
        "password=",
        "",
      ].join("\n"),
    },
    { path: "mods", isDirectory: true },
    { path: "saves", isDirectory: true },
    { path: "logs", isDirectory: true },
    { path: "logs/server.log", content: LOG(ctx) },
  ];
}

const TEMPLATES: Record<string, (ctx: SeedContext) => SeedFile[]> = {
  "minecraft-paper": minecraftJava,
  "minecraft-vanilla": minecraftJava,
  "minecraft-bedrock": minecraftBedrock,
  rust,
  valheim,
  cs2: sourceEngine,
};

export function defaultFiles(ctx: SeedContext): SeedFile[] {
  return (TEMPLATES[ctx.gameSlug] ?? generic)(ctx);
}
