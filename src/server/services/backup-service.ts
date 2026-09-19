import { prisma } from "@/lib/db";
import type { Backup } from "@/generated/prisma/client";
import { MAX_BACKUPS_PER_SERVER, MOCK_TIMINGS } from "@/lib/constants";
import { AppError } from "@/server/errors";
import { getProvider } from "@/server/providers";
import { recordEvent } from "./event-service";
import { getServerForUser, toRef } from "./server-service";

/**
 * The mock backend reports progress through elapsed time rather than callbacks,
 * so CREATING/RESTORING settle to COMPLETED once enough time has passed. The
 * same lazy-transition trick the servers use.
 */
async function settle(backup: Backup): Promise<Backup> {
  if (backup.status !== "CREATING" && backup.status !== "RESTORING") return backup;
  const elapsed = Date.now() - backup.statusChangedAt.getTime();
  if (elapsed < MOCK_TIMINGS.backup) return backup;

  return prisma.backup.update({
    where: { id: backup.id },
    data: {
      status: "COMPLETED",
      statusChangedAt: new Date(),
      completedAt: backup.completedAt ?? new Date(),
    },
  });
}

export async function listBackups(serverId: string, userId: string): Promise<Backup[]> {
  await getServerForUser(serverId, userId);
  const backups = await prisma.backup.findMany({
    where: { serverId },
    orderBy: { createdAt: "desc" },
  });
  return Promise.all(backups.map(settle));
}

async function getBackup(backupId: string, serverId: string): Promise<Backup> {
  const backup = await prisma.backup.findFirst({ where: { id: backupId, serverId } });
  if (!backup) throw new AppError("backup_not_found", 404);
  return settle(backup);
}

export async function createBackup(serverId: string, userId: string, name?: string) {
  const server = await getServerForUser(serverId, userId);
  const ref = toRef(server);
  if (!ref) throw new AppError("invalid_transition", 409, "Server is not provisioned yet.");

  const count = await prisma.backup.count({ where: { serverId } });
  if (count >= MAX_BACKUPS_PER_SERVER) {
    throw new AppError("backup_limit", 409, undefined, { max: MAX_BACKUPS_PER_SERVER });
  }

  const backupName = name?.trim() || `Backup ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  const result = await getProvider().createBackup(ref, backupName);

  const backup = await prisma.backup.create({
    data: {
      serverId,
      name: backupName,
      sizeMb: result.sizeMb,
      providerBackupId: result.providerBackupId,
      status: "CREATING",
    },
  });

  await recordEvent(serverId, "BACKUP_CREATED", backupName, { backupId: backup.id });
  return backup;
}

export async function restoreBackup(serverId: string, userId: string, backupId: string) {
  const server = await getServerForUser(serverId, userId);
  const ref = toRef(server);
  if (!ref) throw new AppError("invalid_transition", 409, "Server is not provisioned yet.");

  if (server.status !== "STOPPED") {
    throw new AppError(
      "invalid_transition",
      409,
      "Stop the server before restoring a backup.",
    );
  }

  const backup = await getBackup(backupId, serverId);
  if (backup.status !== "COMPLETED") {
    throw new AppError("invalid_transition", 409, "This backup is not ready yet.");
  }

  await getProvider().restoreBackup(ref, backup.providerBackupId ?? backup.id);

  const updated = await prisma.backup.update({
    where: { id: backup.id },
    data: { status: "RESTORING", statusChangedAt: new Date() },
  });

  await recordEvent(serverId, "BACKUP_RESTORED", backup.name, { backupId: backup.id });
  return updated;
}

export async function deleteBackup(serverId: string, userId: string, backupId: string) {
  const server = await getServerForUser(serverId, userId);
  const ref = toRef(server);
  const backup = await getBackup(backupId, serverId);

  if (backup.status === "RESTORING") {
    throw new AppError("invalid_transition", 409, "A restore is in progress.");
  }

  if (ref) await getProvider().deleteBackup(ref, backup.providerBackupId ?? backup.id);
  await prisma.backup.delete({ where: { id: backup.id } });
  await recordEvent(serverId, "BACKUP_DELETED", backup.name);
}
