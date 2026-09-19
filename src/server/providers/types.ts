/**
 * Provisioning abstraction. Phase 1 ships a MockProvider; Phase 2 plugs in a
 * PterodactylProvider (Panel Application API + Wings on Linux nodes) without
 * touching the rest of the application.
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

export type ProvisionInput = {
  serverId: string;
  name: string;
  gameSlug: string;
  gameVersion?: string | null;
  ramGb: number;
  vcpu: number;
  storageGb: number;
  regionCode: string;
};

export type ProvisionResult = {
  providerId: string;
  ip: string;
  port: number;
};

/** What the provider needs to know about a server to answer questions about it. */
export type ServerRef = {
  providerId: string;
  /** Last status persisted in our DB. Lets the mock compute lazy transitions. */
  status: ProviderStatus;
  statusChangedAt: Date;
  ramGb: number;
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

export interface ServerProvider {
  readonly name: string;
  createServer(input: ProvisionInput): Promise<ProvisionResult>;
  deleteServer(ref: ServerRef): Promise<void>;
  start(ref: ServerRef): Promise<void>;
  stop(ref: ServerRef): Promise<void>;
  restart(ref: ServerRef): Promise<void>;
  /** Returns the status the provider currently believes the server is in. */
  getStatus(ref: ServerRef): Promise<ProviderStatus>;
  getUsage(ref: ServerRef): Promise<ResourceUsage>;
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
}
