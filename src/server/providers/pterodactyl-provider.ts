import type {
  BackupResult,
  ConsoleLine,
  FileEntry,
  PlayerList,
  ProviderStatus,
  ProvisionResult,
  ResourceUsage,
  ServerProvider,
} from "./types";

/**
 * Phase 2: real provisioning through a Pterodactyl Panel.
 *
 * Implementation notes for later:
 *  - createServer  -> POST /api/application/servers (egg per game, limits from ramGb/vcpu/storageGb,
 *                     node chosen by regionCode)
 *  - power actions -> POST /api/client/servers/{id}/power { signal: start|stop|restart }
 *  - getStatus     -> GET  /api/client/servers/{id}/resources (current_state)
 *  - getUsage      -> same endpoint (resources.cpu_absolute, memory_bytes, disk_bytes)
 *  - console       -> websocket /api/client/servers/{id}/websocket
 *  - sendCommand   -> POST /api/client/servers/{id}/command { command }
 *  - files         -> GET  /api/client/servers/{id}/files/list?directory=, /files/contents?file=,
 *                     POST /files/write?file=, /files/create-folder, /files/delete
 *  - getPlayers    -> not offered by the panel; query the game server (e.g. Minecraft status ping)
 *  - add-ons       -> POST /files/pull { url, directory } to download into the install folder
 *
 * Every method intentionally throws until the integration is built; the
 * signatures are enforced by the `ServerProvider` interface.
 */
export class PterodactylProvider implements ServerProvider {
  readonly name = "pterodactyl";

  constructor(
    private readonly baseUrl = process.env.PTERODACTYL_URL ?? "",
    private readonly apiKey = process.env.PTERODACTYL_API_KEY ?? "",
  ) {
    if (!this.baseUrl || !this.apiKey) {
      throw new Error(
        "PterodactylProvider requires PTERODACTYL_URL and PTERODACTYL_API_KEY.",
      );
    }
  }

  private notImplemented(method: string): never {
    throw new Error(`PterodactylProvider.${method} is not implemented yet.`);
  }

  createServer(): Promise<ProvisionResult> {
    return this.notImplemented("createServer");
  }
  deleteServer(): Promise<void> {
    return this.notImplemented("deleteServer");
  }
  start(): Promise<void> {
    return this.notImplemented("start");
  }
  stop(): Promise<void> {
    return this.notImplemented("stop");
  }
  restart(): Promise<void> {
    return this.notImplemented("restart");
  }
  getStatus(): Promise<ProviderStatus> {
    return this.notImplemented("getStatus");
  }
  getUsage(): Promise<ResourceUsage> {
    return this.notImplemented("getUsage");
  }
  getConsoleLines(): Promise<ConsoleLine[]> {
    return this.notImplemented("getConsoleLines");
  }
  createBackup(): Promise<BackupResult> {
    return this.notImplemented("createBackup");
  }
  restoreBackup(): Promise<void> {
    return this.notImplemented("restoreBackup");
  }
  deleteBackup(): Promise<void> {
    return this.notImplemented("deleteBackup");
  }
  listFiles(): Promise<FileEntry[]> {
    return this.notImplemented("listFiles");
  }
  readFile(): Promise<string> {
    return this.notImplemented("readFile");
  }
  writeFile(): Promise<void> {
    return this.notImplemented("writeFile");
  }
  createDirectory(): Promise<void> {
    return this.notImplemented("createDirectory");
  }
  deletePath(): Promise<void> {
    return this.notImplemented("deletePath");
  }
  sendCommand(): Promise<void> {
    return this.notImplemented("sendCommand");
  }
  getPlayers(): Promise<PlayerList> {
    return this.notImplemented("getPlayers");
  }
  installAddon(): Promise<void> {
    return this.notImplemented("installAddon");
  }
  uninstallAddon(): Promise<void> {
    return this.notImplemented("uninstallAddon");
  }
}
