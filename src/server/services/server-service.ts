import { prisma } from "@/lib/db";
import {
  type Game,
  type Prisma,
  type Region,
  type Server,
  type ServerEventType,
  type ServerStatus,
} from "@/generated/prisma/client";
import { getProvider } from "@/server/providers";
import { toPterodactylTarget } from "@/server/providers/targets";
import type { ConsoleAccess, ProviderStatus, ServerRef } from "@/server/providers/types";
import { AppError } from "@/server/errors";
import type { PowerAction } from "@/lib/validation/server";
import { listEvents, recordEvent } from "./event-service";
import { voidPendingRenewals } from "./invoice-service";
import { notifyProvisioningFailed, notifyServerReady } from "./notification-service";

export const serverInclude = {
  game: true,
  region: true,
  subscription: true,
} satisfies Prisma.ServerInclude;

export type ServerWithRelations = Prisma.ServerGetPayload<{
  include: typeof serverInclude;
}>;

export function toRef(server: Server): ServerRef | null {
  if (!server.providerId) return null;
  return {
    providerId: server.providerId,
    identifier: server.providerIdentifier,
    internalId: server.providerInternalId,
    status: server.status,
    statusChangedAt: server.statusChangedAt,
    ramGb: server.ramGb,
    vcpu: server.vcpu,
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
export async function syncStatus<T extends Server>(server: T): Promise<T> {
  const ref = toRef(server);
  if (!ref) return server;
  let live: ProviderStatus;
  try {
    live = await getProvider().getStatus(ref);
  } catch (error) {
    // Show the last known state instead of failing the page when the provider
    // is unreachable or does not recognise the server.
    if (error instanceof AppError) {
      console.warn(`[servers] status sync failed for ${server.id}: ${error.message}`);
      return server;
    }
    throw error;
  }
  if (live === server.status) return server;
  const statusChangedAt = new Date();
  await prisma.server.update({
    where: { id: server.id },
    data: { status: live, statusChangedAt },
  });

  const eventType = COMPLETION_EVENTS[server.status]?.[live];
  if (eventType) await recordEvent(server.id, eventType);
  if (eventType === "INSTALLED") await notifyServerReady(server.id);

  return { ...server, status: live, statusChangedAt };
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

async function destroyServer(server: Server) {
  const ref = toRef(server);
  if (ref) await getProvider().deleteServer(ref);

  await prisma.$transaction([
    prisma.server.update({
      where: { id: server.id },
      data: { status: "DELETED", statusChangedAt: new Date(), suspensionReason: null },
    }),
    prisma.subscription.updateMany({
      where: { serverId: server.id, status: { in: ["ACTIVE", "PAST_DUE"] } },
      data: { status: "CANCELLED", cancelAtPeriodEnd: false, pastDueSince: null },
    }),
  ]);
  // A deleted server must not leave an unpaid renewal behind.
  await voidPendingRenewals(server.id);

  await recordEvent(server.id, "DELETED", server.name);
}

export async function deleteServer(serverId: string, userId: string) {
  await destroyServer(await getServerForUser(serverId, userId));
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

// Console commands go through console-service: it also turns "stop" and
// "restart" into power actions instead of passing them to the game server.

/** Websocket credentials for the owner's browser, or null to fall back to polling. */
export async function getServerConsoleAccess(
  serverId: string,
  userId: string,
): Promise<ConsoleAccess | null> {
  const server = await getServerForUser(serverId, userId);
  const ref = toRef(server);
  if (!ref || server.status === "SUSPENDED") return null;
  try {
    return await getProvider().getConsoleAccess(ref);
  } catch (error) {
    if (error instanceof AppError && error.code === "invalid_transition") return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Admin: operate on any server regardless of owner.
// ---------------------------------------------------------------------------

export const adminServerInclude = {
  ...serverInclude,
  owner: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ServerInclude;

export async function listAllServers(filter: { status?: ServerStatus; q?: string } = {}) {
  const q = filter.q?.trim();
  const servers = await prisma.server.findMany({
    where: {
      status: filter.status ?? { not: "DELETED" },
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { ip: { contains: q } },
              { owner: { email: { contains: q } } },
            ],
          }
        : {}),
    },
    include: adminServerInclude,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return Promise.all(servers.map(syncStatus));
}

async function getServerById(serverId: string) {
  const server = await prisma.server.findFirst({
    where: { id: serverId, status: { not: "DELETED" } },
  });
  if (!server) throw new AppError("server_not_found", 404);
  return syncStatus(server);
}

// Suspending and unsuspending live in admin-service: they also carry a reason
// and write to the server's activity log.

export async function adminDeleteServer(serverId: string) {
  await destroyServer(await getServerById(serverId));
}

// ---------------------------------------------------------------------------
// Provisioning (called by the order service)
// ---------------------------------------------------------------------------

export type ServerSpec = {
  userId: string;
  name: string;
  gameVersion?: string | null;
  ramGb: number;
  vcpu: number;
  storageGb: number;
  game: Game;
  region: Region;
};

const MAX_ERROR_LENGTH = 500;

/** Inserts the PENDING row an order points at before anything is provisioned. */
export async function createServerRecord(spec: ServerSpec) {
  return prisma.server.create({
    data: {
      name: spec.name,
      ownerId: spec.userId,
      gameId: spec.game.id,
      regionId: spec.region.id,
      ramGb: spec.ramGb,
      vcpu: spec.vcpu,
      storageGb: spec.storageGb,
      gameVersion: spec.gameVersion ?? null,
      status: "PENDING",
    },
  });
}

/**
 * Creates the server on the provider. Never throws for a provisioning failure:
 * the customer has already paid by this point, so the order must still end up
 * with an invoice and a subscription. The returned server is then in ERROR,
 * with `lastError` set for an admin to look at.
 */
export async function provisionServer(server: Server, spec: ServerSpec) {
  try {
    const result = await getProvider().createServer({
      serverId: server.id,
      name: spec.name,
      gameSlug: spec.game.slug,
      gameVersion: spec.gameVersion,
      ramGb: spec.ramGb,
      vcpu: spec.vcpu,
      storageGb: spec.storageGb,
      regionCode: spec.region.code,
      pterodactyl: toPterodactylTarget(spec.game, spec.region),
    });

    const provisioned = await prisma.server.update({
      where: { id: server.id },
      data: {
        providerId: result.providerId,
        providerIdentifier: result.identifier,
        providerInternalId: result.internalId,
        ip: result.ip,
        port: result.port,
        status: "INSTALLING",
        statusChangedAt: new Date(),
        lastError: null,
      },
      include: serverInclude,
    });

    await recordEvent(server.id, "CREATED", spec.name, {
      gameSlug: spec.game.slug,
      regionCode: spec.region.code,
      ramGb: spec.ramGb,
      vcpu: spec.vcpu,
      storageGb: spec.storageGb,
    });

    return provisioned;
  } catch (error) {
    console.error(`Provisioning failed for server ${server.id}`, error);
    const message = error instanceof Error ? error.message : String(error);
    const failed = await prisma.server.update({
      where: { id: server.id },
      data: {
        status: "ERROR",
        statusChangedAt: new Date(),
        lastError: message.slice(0, MAX_ERROR_LENGTH),
      },
      include: serverInclude,
    });
    await recordEvent(server.id, "ERROR", "Provisioning failed");
    // Somebody has paid and has nothing. Without this the only trace was a log
    // line, so the customer would notice before the operator did.
    await notifyProvisioningFailed(server.id);
    return failed;
  }
}

/**
 * Builds the provisioning spec from a server row. The original spec lived only
 * in the order snapshot, which made a failed provisioning unrepeatable — the
 * row itself has everything needed.
 */
export async function specForServer(serverId: string): Promise<{
  server: Server;
  spec: ServerSpec;
} | null> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: { game: true, region: true },
  });
  if (!server) return null;

  return {
    server,
    spec: {
      userId: server.ownerId,
      name: server.name,
      gameVersion: server.gameVersion,
      ramGb: server.ramGb,
      vcpu: server.vcpu,
      storageGb: server.storageGb,
      game: server.game,
      region: server.region,
    },
  };
}

/**
 * Tries again to build a server whose provisioning failed. Until this existed,
 * a customer whose payment succeeded but whose server did not build had no way
 * forward at all: no retry, no refund, just a row in ERROR.
 */
export async function retryProvisioning(serverId: string) {
  const found = await specForServer(serverId);
  if (!found) throw new AppError("server_not_found", 404);

  const { server, spec } = found;
  if (server.status !== "ERROR") {
    throw new AppError(
      "invalid_transition",
      409,
      `Only a server in ERROR can be retried; this one is ${server.status}.`,
    );
  }
  if (server.providerId) {
    throw new AppError(
      "invalid_transition",
      409,
      "This server already exists on the provider; delete it there first.",
    );
  }

  await recordEvent(serverId, "ERROR", "Retrying provisioning");
  return provisionServer(server, spec);
}
