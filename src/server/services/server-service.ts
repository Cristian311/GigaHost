import { prisma } from "@/lib/db";
import {
  type Prisma,
  type ServerEventType,
  type ServerStatus,
} from "@/generated/prisma/client";
import { getProvider } from "@/server/providers";
import type { ServerRef } from "@/server/providers/types";
import { AppError } from "@/server/errors";
import type { PowerAction } from "@/lib/validation/server";
import { listEvents, recordEvent } from "./event-service";

export const serverInclude = {
  game: true,
  region: true,
  subscription: true,
} satisfies Prisma.ServerInclude;

export type ServerWithRelations = Prisma.ServerGetPayload<{
  include: typeof serverInclude;
}>;

export function toRef(server: ServerWithRelations): ServerRef | null {
  if (!server.providerId) return null;
  return {
    providerId: server.providerId,
    status: server.status,
    statusChangedAt: server.statusChangedAt,
    ramGb: server.ramGb,
    storageGb: server.storageGb,
  };
}

/** Activity-log entry produced when a lazy transition completes. */
const COMPLETION_EVENTS: Partial<
  Record<ServerStatus, Partial<Record<ServerStatus, ServerEventType>>>
> = {
  INSTALLING: { STOPPED: "INSTALLED" },
  STARTING: { RUNNING: "STARTED" },
  STOPPING: { STOPPED: "STOPPED" },
};

/** Asks the provider for the live status and persists it if it changed. */
export async function syncStatus(
  server: ServerWithRelations,
): Promise<ServerWithRelations> {
  const ref = toRef(server);
  if (!ref) return server;
  const live = await getProvider().getStatus(ref);
  if (live === server.status) return server;

  const updated = await prisma.server.update({
    where: { id: server.id },
    data: { status: live, statusChangedAt: new Date() },
    include: serverInclude,
  });

  const eventType = COMPLETION_EVENTS[server.status]?.[live];
  if (eventType) await recordEvent(server.id, eventType);

  return updated;
}

export async function listServersForUser(userId: string) {
  const servers = await prisma.server.findMany({
    where: { ownerId: userId, status: { not: "DELETED" } },
    include: serverInclude,
    orderBy: { createdAt: "desc" },
  });
  return Promise.all(servers.map(syncStatus));
}

export async function getServerForUser(serverId: string, userId: string) {
  const server = await prisma.server.findFirst({
    where: { id: serverId, ownerId: userId, status: { not: "DELETED" } },
    include: serverInclude,
  });
  if (!server) throw new AppError("server_not_found", 404);
  return syncStatus(server);
}

const TRANSITIONS: Record<PowerAction, { from: ServerStatus[]; to: ServerStatus }> = {
  start: { from: ["STOPPED", "ERROR"], to: "STARTING" },
  stop: { from: ["RUNNING", "STARTING"], to: "STOPPING" },
  restart: { from: ["RUNNING"], to: "STARTING" },
};

export async function powerServer(
  serverId: string,
  userId: string,
  action: PowerAction,
) {
  const server = await getServerForUser(serverId, userId);
  const ref = toRef(server);
  if (!ref) throw new AppError("invalid_transition", 409, "Server is not provisioned yet.");

  const transition = TRANSITIONS[action];
  if (!transition.from.includes(server.status)) {
    throw new AppError(
      "invalid_transition",
      409,
      `Cannot ${action} a server that is ${server.status}.`,
    );
  }

  const provider = getProvider();
  if (action === "start") await provider.start(ref);
  else if (action === "stop") await provider.stop(ref);
  else await provider.restart(ref);

  const updated = await prisma.server.update({
    where: { id: server.id },
    data: { status: transition.to, statusChangedAt: new Date() },
    include: serverInclude,
  });

  // start/stop are logged when the transition completes in syncStatus; a restart
  // collapses to STARTING, so it is logged at request time instead.
  if (action === "restart") await recordEvent(server.id, "RESTARTED");

  return updated;
}

/** Activity log for a server the user owns. */
export async function getServerEvents(serverId: string, userId: string, limit = 50) {
  await getServerForUser(serverId, userId);
  return listEvents(serverId, limit);
}

export async function renameServer(serverId: string, userId: string, name: string) {
  await getServerForUser(serverId, userId);
  return prisma.server.update({
    where: { id: serverId },
    data: { name },
    include: serverInclude,
  });
}

export async function deleteServer(serverId: string, userId: string) {
  const server = await getServerForUser(serverId, userId);
  const ref = toRef(server);
  if (ref) await getProvider().deleteServer(ref);

  await prisma.$transaction([
    prisma.server.update({
      where: { id: server.id },
      data: { status: "DELETED", statusChangedAt: new Date() },
    }),
    prisma.subscription.updateMany({
      where: { serverId: server.id, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelAtPeriodEnd: false },
    }),
  ]);

  await recordEvent(server.id, "DELETED", server.name);
}

export async function getServerUsage(serverId: string, userId: string) {
  const server = await getServerForUser(serverId, userId);
  const ref = toRef(server);
  if (!ref) throw new AppError("invalid_transition", 409, "Server is not provisioned yet.");
  return getProvider().getUsage(ref);
}

export async function getServerConsole(serverId: string, userId: string, limit = 80) {
  const server = await getServerForUser(serverId, userId);
  const ref = toRef(server);
  if (!ref) return [];
  return getProvider().getConsoleLines(ref, limit);
}

/** Internal: called by the order service once payment succeeded. */
export async function provisionServer(params: {
  userId: string;
  name: string;
  gameId: string;
  gameSlug: string;
  gameVersion?: string | null;
  regionId: string;
  regionCode: string;
  ramGb: number;
  vcpu: number;
  storageGb: number;
}) {
  const server = await prisma.server.create({
    data: {
      name: params.name,
      ownerId: params.userId,
      gameId: params.gameId,
      regionId: params.regionId,
      ramGb: params.ramGb,
      vcpu: params.vcpu,
      storageGb: params.storageGb,
      gameVersion: params.gameVersion ?? null,
      status: "PENDING",
    },
  });

  try {
    const result = await getProvider().createServer({
      serverId: server.id,
      name: params.name,
      gameSlug: params.gameSlug,
      gameVersion: params.gameVersion,
      ramGb: params.ramGb,
      vcpu: params.vcpu,
      storageGb: params.storageGb,
      regionCode: params.regionCode,
    });

    const provisioned = await prisma.server.update({
      where: { id: server.id },
      data: {
        providerId: result.providerId,
        ip: result.ip,
        port: result.port,
        status: "INSTALLING",
        statusChangedAt: new Date(),
      },
      include: serverInclude,
    });

    await recordEvent(server.id, "CREATED", params.name, {
      gameSlug: params.gameSlug,
      regionCode: params.regionCode,
      ramGb: params.ramGb,
      vcpu: params.vcpu,
      storageGb: params.storageGb,
    });

    return provisioned;
  } catch (error) {
    await prisma.server.update({
      where: { id: server.id },
      data: { status: "ERROR", statusChangedAt: new Date() },
    });
    await recordEvent(server.id, "ERROR", "Provisioning failed");
    throw error;
  }
}
