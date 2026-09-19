/**
 * Provisioning abstraction. MockProvider simulates servers; PterodactylProvider
 * drives a real Pterodactyl Panel (Application + Client API) and Wings nodes.
 * The rest of the application only talks to this interface.
 */

export type ProviderStatus =
  | "PENDING"
  | "INSTALLING"
  | "STOPPED"
  | "STARTING"
  | "RUNNING"
  | "STOPPING"
  | "SUSPENDED"
  | "ERROR"
  | "DELETED";

/** Where and how to create a server on Pterodactyl (resolved from Game + Region). */
export type PterodactylTarget = {
  nestId: number;
  eggId: number;
  locationId: number;
  /** Overrides the egg image; null picks a Java image matching the version. */
  dockerImage: string | null;
  /** Egg variable that receives the chosen game version, e.g. MINECRAFT_VERSION. */
  versionVariable: string | null;
  /** Fixed egg variables layered over the egg defaults. */
  variables: Record<string, string>;
};

export type ProvisionInput = {
  serverId: string;
  name: string;
  gameSlug: string;
  gameVersion?: string | null;
  ramGb: number;
  vcpu: number;
  storageGb: number;
  regionCode: string;
  /** Null when the game or region has no Pterodactyl configuration. */
  pterodactyl: PterodactylTarget | null;
};

export type ProvisionResult = {
  providerId: string;
  /** Short identifier used by the Pterodactyl Client API. */
  identifier: string | null;
  /** Numeric id used by the Pterodactyl Application API. */
  internalId: number | null;
  ip: string;
  port: number;
};

/** What the provider needs to know about a server to answer questions about it. */
export type ServerRef = {
  providerId: string;
  identifier: string | null;
  internalId: number | null;
  /** Last status persisted in our DB. Lets the mock compute lazy transitions. */
  status: ProviderStatus;
  statusChangedAt: Date;
  ramGb: number;
  vcpu: number;
  storageGb: number;
};

export type ResourceUsage = {
  cpuPct: number;
  ramUsedMb: number;
  ramTotalMb: number;
  diskUsedMb: number;
  diskTotalMb: number;
  players: number;
  uptimeSec: number;
  /** Small history for sparklines (oldest first). */
  history: Array<{ t: number; cpuPct: number; ramUsedMb: number }>;
};

export type ConsoleLine = {
  ts: string;
  level: "info" | "warn" | "error";
  text: string;
};

/** Credentials for the browser to open the node's console websocket directly. */
export type ConsoleAccess = {
  socketUrl: string;
  token: string;
};

export interface ServerProvider {
  readonly name: string;
  createServer(input: ProvisionInput): Promise<ProvisionResult>;
  deleteServer(ref: ServerRef): Promise<void>;
  start(ref: ServerRef): Promise<void>;
  stop(ref: ServerRef): Promise<void>;
  restart(ref: ServerRef): Promise<void>;
  /** Admin action: stops the server and blocks the owner from starting it. */
  suspend(ref: ServerRef): Promise<void>;
  unsuspend(ref: ServerRef): Promise<void>;
  /** Returns the status the provider currently believes the server is in. */
  getStatus(ref: ServerRef): Promise<ProviderStatus>;
  getUsage(ref: ServerRef): Promise<ResourceUsage>;
  /** Polled console snapshot. Providers with a live socket may return []. */
  getConsoleLines(ref: ServerRef, limit?: number): Promise<ConsoleLine[]>;
  sendCommand(ref: ServerRef, command: string): Promise<void>;
  /** Null when the provider has no live console (the UI falls back to polling). */
  getConsoleAccess(ref: ServerRef): Promise<ConsoleAccess | null>;
}
