import { prisma } from "@/lib/db";
import { MAX_BACKUPS_PER_SERVER, MAX_TASKS_PER_SERVER } from "@/lib/constants";
import type { Prisma, ScheduledTask } from "@/generated/prisma/client";
import { computeNextRun, type Schedule } from "@/lib/schedule/next-run";
import type { TaskInput } from "@/lib/validation/panel";
import { AppError } from "@/server/errors";
import { getProvider } from "@/server/providers";
import { createBackup, deleteBackup, listBackups } from "./backup-service";
import { cleanCommand } from "./console-service";
import { recordEvent } from "./event-service";
import { withJobLock } from "./job-lock";
import { getServerForUser, powerServer, syncStatus, serverInclude, toRef } from "./server-service";

/** Automatic backups are named like this, which is also how rotation finds them. */
const AUTO_BACKUP_PREFIX = "Auto ";

function scheduleOf(task: Pick<TaskInput, "frequency" | "everyHours" | "minuteOfDayUtc" | "dayOfWeekUtc">): Schedule {
  switch (task.frequency) {
    case "HOURLY":
      return { frequency: "HOURLY", everyHours: task.everyHours };
    case "DAILY":
      return { frequency: "DAILY", minuteOfDayUtc: task.minuteOfDayUtc };
    default:
      return {
        frequency: "WEEKLY",
        minuteOfDayUtc: task.minuteOfDayUtc,
        dayOfWeekUtc: task.dayOfWeekUtc,
      };
  }
}

function toData(input: TaskInput, now: Date) {
  return {
    name: input.name,
    action: input.action,
    payload: input.action === "COMMAND" ? cleanCommand(input.payload ?? "") : null,
    frequency: input.frequency,
    everyHours: input.everyHours,
    minuteOfDayUtc: input.minuteOfDayUtc,
    dayOfWeekUtc: input.dayOfWeekUtc,
    enabled: input.enabled,
    nextRunAt: computeNextRun(scheduleOf(input), now),
  };
}

export async function listTasks(serverId: string, userId: string) {
  await getServerForUser(serverId, userId);
  return prisma.scheduledTask.findMany({ where: { serverId }, orderBy: { createdAt: "asc" } });
}

export async function createTask(
  serverId: string,
  userId: string,
  input: TaskInput,
  now: Date = new Date(),
) {
  await getServerForUser(serverId, userId);
  const count = await prisma.scheduledTask.count({ where: { serverId } });
  if (count >= MAX_TASKS_PER_SERVER) {
    throw new AppError("task_limit", 409, undefined, { max: MAX_TASKS_PER_SERVER });
  }
  return prisma.scheduledTask.create({ data: { serverId, ...toData(input, now) } });
}

async function ownedTask(serverId: string, userId: string, taskId: string) {
  await getServerForUser(serverId, userId);
  const task = await prisma.scheduledTask.findFirst({ where: { id: taskId, serverId } });
  if (!task) throw new AppError("task_not_found", 404);
  return task;
}

export async function updateTask(
  serverId: string,
  userId: string,
  taskId: string,
  input: TaskInput,
  now: Date = new Date(),
) {
  await ownedTask(serverId, userId, taskId);
  return prisma.scheduledTask.update({ where: { id: taskId }, data: toData(input, now) });
}

export async function deleteTask(serverId: string, userId: string, taskId: string) {
  await ownedTask(serverId, userId, taskId);
  await prisma.scheduledTask.delete({ where: { id: taskId } });
}

// --- execution -------------------------------------------------------------------

const dueInclude = {
  server: { include: serverInclude },
} satisfies Prisma.ScheduledTaskInclude;
type DueTask = Prisma.ScheduledTaskGetPayload<{ include: typeof dueInclude }>;

/** Makes room for an automatic backup by dropping the oldest automatic one. */
async function rotateAutoBackups(serverId: string, ownerId: string) {
  const backups = await listBackups(serverId, ownerId);
  if (backups.length < MAX_BACKUPS_PER_SERVER) return;
  const oldest = backups
    .filter((backup) => backup.name.startsWith(AUTO_BACKUP_PREFIX) && backup.status === "COMPLETED")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  // Backups the customer made by hand are never sacrificed for a scheduled one.
  if (oldest) await deleteBackup(serverId, ownerId, oldest.id);
}

/** Returns "ok" or "skipped: …"; throws when the action itself failed. */
async function execute(task: DueTask, now: Date): Promise<string> {
  const server = await syncStatus(task.server);
  const ownerId = server.ownerId;

  if (["PENDING", "INSTALLING", "SUSPENDED", "DELETED"].includes(server.status)) {
    return `skipped: server is ${server.status.toLowerCase()}`;
  }

  switch (task.action) {
    case "RESTART":
      if (server.status !== "RUNNING") return "skipped: server is not running";
      await powerServer(server.id, ownerId, "restart");
      return "ok";

    case "COMMAND": {
      if (server.status !== "RUNNING") return "skipped: server is not running";
      const ref = toRef(server);
      if (!ref) return "skipped: server is not provisioned";
      await getProvider().sendCommand(ref, task.payload ?? "");
      return "ok";
    }

    case "BACKUP":
      await rotateAutoBackups(server.id, ownerId);
      await createBackup(
        server.id,
        ownerId,
        `${AUTO_BACKUP_PREFIX}${now.toISOString().slice(0, 16).replace("T", " ")}`,
      );
      return "ok";
  }
}

export type TaskRunReport = {
  ran: number;
  skipped: number;
  failed: number;
  /** True when another run already held the lock, so this one did nothing. */
  lockedOut?: boolean;
};

/**
 * Runs every task whose time has come. Meant for the scheduler endpoint; like
 * the billing cycle it works from timestamps, and a task that was missed while
 * the scheduler was down runs once, not once per missed slot.
 *
 * One run at a time: due tasks are read and then executed without claiming each
 * row, so two overlapping runs would restart a server or take a backup twice.
 */
export async function runDueTasks(now: Date = new Date()): Promise<TaskRunReport> {
  const report = await withJobLock("due-tasks", () => dueTasksPass(now), { now });
  return report ?? { ran: 0, skipped: 0, failed: 0, lockedOut: true };
}

async function dueTasksPass(now: Date): Promise<TaskRunReport> {
  const report: TaskRunReport = { ran: 0, skipped: 0, failed: 0 };
  const due = await prisma.scheduledTask.findMany({
    where: { enabled: true, nextRunAt: { lte: now }, server: { status: { not: "DELETED" } } },
    include: dueInclude,
    orderBy: { nextRunAt: "asc" },
    take: 200,
  });

  for (const task of due) {
    let status: string;
    try {
      status = await execute(task, now);
    } catch (error) {
      status = `failed: ${error instanceof AppError ? error.code : "internal_error"}`;
      if (!(error instanceof AppError)) console.error(`Scheduled task ${task.id} failed`, error);
    }

    if (status === "ok") report.ran += 1;
    else if (status.startsWith("skipped")) report.skipped += 1;
    else report.failed += 1;

    await prisma.scheduledTask.update({
      where: { id: task.id },
      data: {
        lastRunAt: now,
        lastStatus: status,
        nextRunAt: computeNextRun(scheduleOf(task), now),
      },
    });
    await recordEvent(task.serverId, "TASK_RAN", `${task.name}: ${status}`, {
      taskId: task.id,
      action: task.action,
    });
  }

  return report;
}

export type { ScheduledTask };
