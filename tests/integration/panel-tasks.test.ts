import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { MAX_BACKUPS_PER_SERVER, MAX_TASKS_PER_SERVER } from "@/lib/constants";
import { taskSchema, type TaskInput } from "@/lib/validation/panel";
import { createBackup, listBackups } from "@/server/services/backup-service";
import { listEvents } from "@/server/services/event-service";
import { getServerConsole } from "@/server/services/server-service";
import {
  createTask,
  deleteTask,
  listTasks,
  runDueTasks,
  updateTask,
} from "@/server/services/task-service";
import { ageBackup, createServerFor, createUser, resetData, setStatus } from "../setup/db";

const HOUR = 3_600_000;

const task = (overrides: Partial<TaskInput> = {}): TaskInput =>
  taskSchema.parse({
    name: "Daily restart",
    action: "RESTART",
    frequency: "DAILY",
    minuteOfDayUtc: 5 * 60,
    ...overrides,
  });

async function server(status: "RUNNING" | "STOPPED" = "RUNNING") {
  const user = await createUser();
  const { serverId } = await createServerFor(user.id);
  await setStatus(serverId, status);
  return { user, serverId };
}

/** Pretends the task's time has come. */
const makeDue = (taskId: string) =>
  prisma.scheduledTask.update({
    where: { id: taskId },
    data: { nextRunAt: new Date(Date.now() - 1000) },
  });

describe("scheduled tasks", () => {
  beforeEach(resetData);

  describe("managing", () => {
    it("schedules the first run in the future", async () => {
      const { user, serverId } = await server();
      const now = new Date("2026-03-10T03:30:00Z");

      const created = await createTask(serverId, user.id, task(), now);

      expect(created.nextRunAt).toEqual(new Date("2026-03-10T05:00:00Z"));
      expect(created).toMatchObject({ enabled: true, lastRunAt: null, lastStatus: null });
    });

    it("reschedules when the time is edited", async () => {
      const { user, serverId } = await server();
      const now = new Date("2026-03-10T03:30:00Z");
      const created = await createTask(serverId, user.id, task(), now);

      const updated = await updateTask(
        serverId,
        user.id,
        created.id,
        task({ frequency: "WEEKLY", dayOfWeekUtc: 0, minuteOfDayUtc: 4 * 60 }),
        now,
      );

      expect(updated.nextRunAt).toEqual(new Date("2026-03-15T04:00:00Z"));
    });

    it("requires a command for command tasks and cleans it", async () => {
      expect(() => task({ action: "COMMAND", payload: "" })).toThrow();

      const { user, serverId } = await server();
      const created = await createTask(
        serverId,
        user.id,
        task({ action: "COMMAND", payload: "  say Backup in 1 minute  " }),
      );
      expect(created.payload).toBe("say Backup in 1 minute");

      await expect(
        createTask(serverId, user.id, task({ action: "COMMAND", payload: "say hi\nop attacker" })),
      ).rejects.toMatchObject({ code: "validation" });
    });

    it("caps the number of tasks per server", async () => {
      const { user, serverId } = await server();
      for (let i = 0; i < MAX_TASKS_PER_SERVER; i += 1) {
        await createTask(serverId, user.id, task({ name: `Task ${i}` }));
      }

      await expect(createTask(serverId, user.id, task())).rejects.toMatchObject({
        code: "task_limit",
      });
    });

    it("is private to the server's owner", async () => {
      const { user, serverId } = await server();
      const stranger = await createUser();
      const other = await server();
      const created = await createTask(serverId, user.id, task());

      await expect(listTasks(serverId, stranger.id)).rejects.toMatchObject({
        code: "server_not_found",
      });
      await expect(deleteTask(serverId, stranger.id, created.id)).rejects.toMatchObject({
        code: "server_not_found",
      });
      // Owning *a* server is not enough: the task must belong to the one named.
      await expect(
        deleteTask(other.serverId, other.user.id, created.id),
      ).rejects.toMatchObject({ code: "task_not_found" });
      expect(await listTasks(serverId, user.id)).toHaveLength(1);
    });
  });

  describe("running", () => {
    it("leaves tasks alone until their time comes", async () => {
      const { user, serverId } = await server();
      await createTask(serverId, user.id, task());

      expect(await runDueTasks()).toEqual({ ran: 0, skipped: 0, failed: 0 });
    });

    it("restarts a running server and schedules the next run", async () => {
      const { user, serverId } = await server("RUNNING");
      const created = await createTask(serverId, user.id, task());
      await makeDue(created.id);

      const report = await runDueTasks();

      expect(report).toEqual({ ran: 1, skipped: 0, failed: 0 });
      expect((await prisma.server.findUniqueOrThrow({ where: { id: serverId } })).status).toBe(
        "STARTING",
      );
      const after = await prisma.scheduledTask.findUniqueOrThrow({ where: { id: created.id } });
      expect(after.lastStatus).toBe("ok");
      expect(after.lastRunAt).not.toBeNull();
      expect(after.nextRunAt.getTime()).toBeGreaterThan(Date.now());

      const events = (await listEvents(serverId)).map((event) => event.type);
      expect(events).toEqual(expect.arrayContaining(["RESTARTED", "TASK_RAN"]));
    });

    it("does not start a server the customer has stopped", async () => {
      const { user, serverId } = await server("STOPPED");
      const created = await createTask(serverId, user.id, task());
      await makeDue(created.id);

      expect(await runDueTasks()).toEqual({ ran: 0, skipped: 1, failed: 0 });

      expect((await prisma.server.findUniqueOrThrow({ where: { id: serverId } })).status).toBe(
        "STOPPED",
      );
      const after = await prisma.scheduledTask.findUniqueOrThrow({ where: { id: created.id } });
      expect(after.lastStatus).toBe("skipped: server is not running");
      // Skipped, not stuck: it is rescheduled like any other run.
      expect(after.nextRunAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("sends scheduled commands to the console", async () => {
      const { user, serverId } = await server("RUNNING");
      const created = await createTask(
        serverId,
        user.id,
        task({ name: "Announce", action: "COMMAND", payload: "say Server restarts at 05:00" }),
      );
      await makeDue(created.id);

      await runDueTasks();

      const lines = (await getServerConsole(serverId, user.id, 200)).map((line) => line.text);
      expect(lines).toContain("[Server] Server restarts at 05:00");
    });

    it("takes automatic backups, stopped or running", async () => {
      const { user, serverId } = await server("STOPPED");
      const created = await createTask(
        serverId,
        user.id,
        task({ name: "Nightly backup", action: "BACKUP" }),
      );
      await makeDue(created.id);

      expect(await runDueTasks()).toMatchObject({ ran: 1 });

      const backups = await listBackups(serverId, user.id);
      expect(backups).toHaveLength(1);
      expect(backups[0].name).toMatch(/^Auto \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    });

    it("rotates automatic backups but never deletes one the customer made", async () => {
      const { user, serverId } = await server("STOPPED");
      const manual = await createBackup(serverId, user.id, "Before the big build");
      await ageBackup(manual.id, 10_000);
      const created = await createTask(serverId, user.id, task({ action: "BACKUP" }));

      // Fill the remaining slots with automatic backups, oldest first.
      const autoIds: string[] = [];
      for (let i = 0; i < MAX_BACKUPS_PER_SERVER - 1; i += 1) {
        await makeDue(created.id);
        await runDueTasks(new Date(Date.now() + i * 60_000));
        const newest = (await listBackups(serverId, user.id)).find(
          (backup) => !autoIds.includes(backup.id) && backup.id !== manual.id,
        )!;
        autoIds.push(newest.id);
        await ageBackup(newest.id, 10_000);
        await prisma.backup.update({
          where: { id: newest.id },
          data: { createdAt: new Date(Date.now() - (10 - i) * HOUR) },
        });
      }
      expect(await listBackups(serverId, user.id)).toHaveLength(MAX_BACKUPS_PER_SERVER);

      await makeDue(created.id);
      expect(await runDueTasks(new Date(Date.now() + HOUR))).toMatchObject({ ran: 1, failed: 0 });

      const ids = (await listBackups(serverId, user.id)).map((backup) => backup.id);
      expect(ids).toHaveLength(MAX_BACKUPS_PER_SERVER);
      expect(ids).toContain(manual.id);
      expect(ids).not.toContain(autoIds[0]); // the oldest automatic one made room
    });

    it("reports a failure when only hand-made backups fill the limit", async () => {
      const { user, serverId } = await server("STOPPED");
      for (let i = 0; i < MAX_BACKUPS_PER_SERVER; i += 1) {
        const backup = await createBackup(serverId, user.id, `Manual ${i}`);
        await ageBackup(backup.id, 10_000);
      }
      const created = await createTask(serverId, user.id, task({ action: "BACKUP" }));
      await makeDue(created.id);

      expect(await runDueTasks()).toEqual({ ran: 0, skipped: 0, failed: 1 });

      const after = await prisma.scheduledTask.findUniqueOrThrow({ where: { id: created.id } });
      expect(after.lastStatus).toBe("failed: backup_limit");
      expect(await listBackups(serverId, user.id)).toHaveLength(MAX_BACKUPS_PER_SERVER);
    });

    it("skips disabled tasks and suspended servers", async () => {
      const { user, serverId } = await server("RUNNING");
      const disabled = await createTask(serverId, user.id, task({ enabled: false }));
      await makeDue(disabled.id);
      expect(await runDueTasks()).toEqual({ ran: 0, skipped: 0, failed: 0 });

      const enabled = await createTask(serverId, user.id, task({ name: "Enabled" }));
      await makeDue(enabled.id);
      await setStatus(serverId, "SUSPENDED");

      expect(await runDueTasks()).toEqual({ ran: 0, skipped: 1, failed: 0 });
      const after = await prisma.scheduledTask.findUniqueOrThrow({ where: { id: enabled.id } });
      expect(after.lastStatus).toBe("skipped: server is suspended");
    });

    it("runs a task missed during an outage once, not once per missed slot", async () => {
      const { user, serverId } = await server("RUNNING");
      const created = await createTask(
        serverId,
        user.id,
        task({ frequency: "HOURLY", everyHours: 1, action: "COMMAND", payload: "save-all" }),
      );
      await prisma.scheduledTask.update({
        where: { id: created.id },
        data: { nextRunAt: new Date(Date.now() - 30 * HOUR) },
      });

      expect(await runDueTasks()).toMatchObject({ ran: 1 });
      expect(await runDueTasks()).toMatchObject({ ran: 0 });
      expect(await prisma.consoleEntry.count({ where: { serverId, kind: "COMMAND" } })).toBe(1);
    });

    it("keeps going when one task fails", async () => {
      const a = await server("STOPPED");
      const b = await server("STOPPED");
      for (let i = 0; i < MAX_BACKUPS_PER_SERVER; i += 1) {
        const backup = await createBackup(a.serverId, a.user.id, `Manual ${i}`);
        await ageBackup(backup.id, 10_000);
      }
      const failing = await createTask(a.serverId, a.user.id, task({ action: "BACKUP" }));
      const working = await createTask(b.serverId, b.user.id, task({ action: "BACKUP" }));
      await makeDue(failing.id);
      await makeDue(working.id);

      expect(await runDueTasks()).toEqual({ ran: 1, skipped: 0, failed: 1 });
      expect(await listBackups(b.serverId, b.user.id)).toHaveLength(1);
    });
  });
});
