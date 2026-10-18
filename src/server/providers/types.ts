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

/** The three dials a customer can move, in the units the site uses. */
export type ResourceSpec = {
  ramGb: number;
  vcpu: number;
  storageGb: number;
};

export type ProvisionInput = ResourceSpec & {
  serverId: string;
  name: string;
  gameSlug: string;
  gameVersion?: string | null;
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

export type BackupResult = {
  providerBackupId: string;
  sizeMb: number;
};

export type FileEntry = {
  name: string;
  /** Normalised path relative to the server root. */
  path: string;
  isDirectory: boolean;
  /** Listed and deletable, but not opened in the editor. */
  isBinary: boolean;
  sizeBytes: number;
  updatedAt: Date;
};

export type PlayerInfo = {
  name: string;
  joinedAt: string;
  pingMs: number;
};

export type PlayerList = {
  online: number;
  max: number;
  players: PlayerInfo[];
};

/** Where an add-on from the catalogue lands inside a server. */
export type AddonFile = {
  installDir: string;
  fileName: string;
  sizeKb: number;
};

/** Credentials for the browser to open the node's console websocket directly. */
export type ConsoleAccess = {
  socketUrl: string;
  token: string;
};

/**
 * What a provider can actually do. Not every backend implements every panel
 * feature, and a tab that always errors is worse than one that is not there —
 * especially when the marketing pages promise the feature.
 *
 * Declared rather than discovered so the UI can decide before it renders,
 * without calling the provider and catching `provider_unavailable`.
 */
export type ProviderCapabilities = {
  files: boolean;
  players: boolean;
  addons: boolean;
  backups: boolean;
  /** Scheduled tasks are only as capable as the actions they invoke. */
  scheduledBackups: boolean;
};

export interface ServerProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  createServer(input: ProvisionInput): Promise<ProvisionResult>;
  deleteServer(ref: ServerRef): Promise<void>;
  start(ref: ServerRef): Promise<void>;
  stop(ref: ServerRef): Promise<void>;
  restart(ref: ServerRef): Promise<void>;
  /**
   * Applies new resource limits to an existing server.
   *
   * Called before the resize is marked paid: charging for memory the server
   * never gets is the one failure worth an exception rather than a log line.
   */
  resize(ref: ServerRef, spec: ResourceSpec): Promise<void>;
  /** Admin action: stops the server and blocks the owner from starting it. */
  suspend(ref: ServerRef): Promise<void>;
  unsuspend(ref: ServerRef): Promise<void>;
  /** Returns the status the provider currently believes the server is in. */
  getStatus(ref: ServerRef): Promise<ProviderStatus>;
  getUsage(ref: ServerRef): Promise<ResourceUsage>;
  /** Polled console snapshot. Providers with a live socket may return []. */
  getConsoleLines(ref: ServerRef, limit?: number): Promise<ConsoleLine[]>;
  createBackup(ref: ServerRef, name: string): Promise<BackupResult>;
  restoreBackup(ref: ServerRef, providerBackupId: string): Promise<void>;
  deleteBackup(ref: ServerRef, providerBackupId: string): Promise<void>;

  // File manager. Paths arrive normalised (see src/lib/files/path.ts).
  listFiles(ref: ServerRef, directory: string): Promise<FileEntry[]>;
  readFile(ref: ServerRef, path: string): Promise<string>;
  writeFile(ref: ServerRef, path: string, content: string): Promise<void>;
  createDirectory(ref: ServerRef, path: string): Promise<void>;
  deletePath(ref: ServerRef, path: string): Promise<void>;

  /** Writes a line to the server's console, as typing it in-game would. */
  sendCommand(ref: ServerRef, command: string): Promise<void>;
  getPlayers(ref: ServerRef): Promise<PlayerList>;

  installAddon(ref: ServerRef, addon: AddonFile): Promise<void>;
  uninstallAddon(ref: ServerRef, addon: AddonFile): Promise<void>;

  /** Null when the provider has no live console (the UI falls back to polling). */
  getConsoleAccess(ref: ServerRef): Promise<ConsoleAccess | null>;
}
