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
}
