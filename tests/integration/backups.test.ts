import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { MAX_BACKUPS_PER_SERVER, MOCK_TIMINGS } from "@/lib/constants";
import {
  createBackup,
  deleteBackup,
  listBackups,
  restoreBackup,
} from "@/server/services/backup-service";
import { ageBackup, createServerFor, createUser, resetData, setStatus } from "../setup/db";

async function stoppedServer() {
  const user = await createUser();
  const { serverId } = await createServerFor(user.id);
  await setStatus(serverId, "STOPPED");
  return { user, serverId };
}

describe("backups", () => {
  beforeEach(resetData);

  it("creates a backup that completes after the mock delay", async () => {
    const { user, serverId } = await stoppedServer();

    const backup = await createBackup(serverId, user.id, "Before the update");
    expect(backup.status).toBe("CREATING");
    expect(backup.name).toBe("Before the update");
    expect(backup.sizeMb).toBeGreaterThan(0);
    expect(backup.providerBackupId).toMatch(/^mockbk_/);

    let [listed] = await listBackups(serverId, user.id);
    expect(listed.status).toBe("CREATING");

    await ageBackup(backup.id, MOCK_TIMINGS.backup + 1000);
    [listed] = await listBackups(serverId, user.id);
    expect(listed.status).toBe("COMPLETED");
    expect(listed.completedAt).toBeInstanceOf(Date);
  });

  it("generates a default name when none is given", async () => {
    const { user, serverId } = await stoppedServer();
    const backup = await createBackup(serverId, user.id);
    expect(backup.name.length).toBeGreaterThan(0);
  });

  it("enforces the per-server backup limit", async () => {
    const { user, serverId } = await stoppedServer();

    for (let i = 0; i < MAX_BACKUPS_PER_SERVER; i++) {
      await createBackup(serverId, user.id, `Backup ${i}`);
    }

    await expect(createBackup(serverId, user.id, "One too many")).rejects.toMatchObject({
      code: "backup_limit",
      details: { max: MAX_BACKUPS_PER_SERVER },
    });

    expect(await prisma.backup.count({ where: { serverId } })).toBe(MAX_BACKUPS_PER_SERVER);
  });

  it("restores only a completed backup on a stopped server", async () => {
    const { user, serverId } = await stoppedServer();
    const backup = await createBackup(serverId, user.id, "Snapshot");

    // Still CREATING
    await expect(restoreBackup(serverId, user.id, backup.id)).rejects.toMatchObject({
      code: "invalid_transition",
    });

    await ageBackup(backup.id, MOCK_TIMINGS.backup + 1000);
    await listBackups(serverId, user.id); // settles the status

    await setStatus(serverId, "RUNNING");
    await expect(restoreBackup(serverId, user.id, backup.id)).rejects.toMatchObject({
      code: "invalid_transition",
    });

    await setStatus(serverId, "STOPPED");
    const restoring = await restoreBackup(serverId, user.id, backup.id);
    expect(restoring.status).toBe("RESTORING");

    await ageBackup(backup.id, MOCK_TIMINGS.backup + 1000);
    const [after] = await listBackups(serverId, user.id);
    expect(after.status).toBe("COMPLETED");
  });

  it("deletes a backup but not while it is restoring", async () => {
    const { user, serverId } = await stoppedServer();
    const backup = await createBackup(serverId, user.id, "Doomed");
    await ageBackup(backup.id, MOCK_TIMINGS.backup + 1000);
    await listBackups(serverId, user.id);

    await restoreBackup(serverId, user.id, backup.id);
    await expect(deleteBackup(serverId, user.id, backup.id)).rejects.toMatchObject({
      code: "invalid_transition",
    });

    await ageBackup(backup.id, MOCK_TIMINGS.backup + 1000);
    await listBackups(serverId, user.id);
    await deleteBackup(serverId, user.id, backup.id);

    expect(await prisma.backup.count({ where: { serverId } })).toBe(0);
  });

  it("reports a missing backup", async () => {
    const { user, serverId } = await stoppedServer();
    await expect(restoreBackup(serverId, user.id, "nope")).rejects.toMatchObject({
      code: "backup_not_found",
      status: 404,
    });
  });

  it("keeps backups private to the owner", async () => {
    const { user, serverId } = await stoppedServer();
    const stranger = await createUser();
    const backup = await createBackup(serverId, user.id, "Private");

    await expect(listBackups(serverId, stranger.id)).rejects.toMatchObject({
      code: "server_not_found",
    });
    await expect(createBackup(serverId, stranger.id)).rejects.toMatchObject({
      code: "server_not_found",
    });
    await expect(deleteBackup(serverId, stranger.id, backup.id)).rejects.toMatchObject({
      code: "server_not_found",
    });
  });

  it("logs backup activity", async () => {
    const { user, serverId } = await stoppedServer();
    const backup = await createBackup(serverId, user.id, "Logged");
    await ageBackup(backup.id, MOCK_TIMINGS.backup + 1000);
    await listBackups(serverId, user.id);
    await restoreBackup(serverId, user.id, backup.id);
    await ageBackup(backup.id, MOCK_TIMINGS.backup + 1000);
    await listBackups(serverId, user.id);
    await deleteBackup(serverId, user.id, backup.id);

    const types = (
      await prisma.serverEvent.findMany({ where: { serverId }, orderBy: { createdAt: "asc" } })
    ).map((e) => e.type);

    expect(types).toContain("BACKUP_CREATED");
    expect(types).toContain("BACKUP_RESTORED");
    expect(types).toContain("BACKUP_DELETED");
  });
});
