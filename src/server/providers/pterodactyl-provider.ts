import type {
  BackupResult,
  ConsoleLine,
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
}
