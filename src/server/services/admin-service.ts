import { prisma } from "@/lib/db";
import type { ServerStatus } from "@/generated/prisma/client";
import { getPterodactylConfig, getServerProviderKind } from "@/lib/env";
import { serializeVersions } from "@/lib/games";
import { AppError } from "@/server/errors";
import { pteroApp } from "@/server/providers/pterodactyl/client";
import { parseEggVariables } from "@/server/providers/targets";
import type { z } from "zod";
import type {
  pricingConfigSchema,
  upsertGameSchema,
  upsertRegionSchema,
} from "@/lib/validation/admin";
import { getProvider } from "@/server/providers";
import { recordEvent } from "./event-service";
import { toRef } from "./server-service";

const DAY_MS = 86_400_000;

export async function getAdminStats() {
  const [users, servers, runningServers, orders, revenue] = await Promise.all([
    prisma.user.count(),
    prisma.server.count({ where: { status: { not: "DELETED" } } }),
    prisma.server.count({ where: { status: "RUNNING" } }),
    prisma.order.count({ where: { status: "PAID" } }),
    prisma.order.aggregate({
      where: { status: "PAID" },
      _sum: { totalCents: true },
    }),
  ]);
  return {
    users,
    servers,
    runningServers,
    orders,
    revenueCents: revenue._sum.totalCents ?? 0,
  };
}

/** Everything the admin overview page shows. */
export async function getAdminOverview() {
  const now = Date.now();
  const [stats, byStatus, revenue30d, renewalsDue, recentOrders, recentUsers] =
    await Promise.all([
      getAdminStats(),
      prisma.server.groupBy({
        by: ["status"],
        where: { status: { not: "DELETED" } },
        _count: { _all: true },
      }),
      prisma.order.aggregate({
        where: { status: "PAID", createdAt: { gte: new Date(now - 30 * DAY_MS) } },
        _sum: { totalCents: true },
      }),
      prisma.subscription.count({
        where: {
          status: "ACTIVE",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: { lte: new Date(now + 7 * DAY_MS) },
        },
      }),
      prisma.order.findMany({
        take: 6,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { email: true } },
          server: { select: { name: true } },
        },
      }),
      prisma.user.findMany({
        take: 6,
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, email: true, createdAt: true },
      }),
    ]);

  const serversByStatus: Partial<Record<ServerStatus, number>> = {};
  for (const row of byStatus) serversByStatus[row.status] = row._count._all;

  return {
    ...stats,
    revenue30dCents: revenue30d._sum.totalCents ?? 0,
    renewalsDue,
    serversByStatus,
    recentOrders,
    recentUsers,
  };
}

export async function listUsers() {
  return prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      _count: { select: { servers: true, orders: true } },
    },
  });
}

export async function setUserRole(userId: string, role: "USER" | "ADMIN") {
  return prisma.user.update({ where: { id: userId }, data: { role } });
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

const BILLING_LIST_LIMIT = 200;

export async function listAllOrders() {
  return prisma.order.findMany({
    take: BILLING_LIST_LIMIT,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { email: true } },
      server: { select: { id: true, name: true } },
    },
  });
}

export async function listAllInvoices() {
  return prisma.invoice.findMany({
    take: BILLING_LIST_LIMIT,
    orderBy: { issuedAt: "desc" },
    include: { user: { select: { email: true } } },
  });
}

/** Soonest renewal first, so the admin sees what is about to bill. */
export async function listAllSubscriptions() {
  return prisma.subscription.findMany({
    take: BILLING_LIST_LIMIT,
    orderBy: { currentPeriodEnd: "asc" },
    include: {
      user: { select: { email: true } },
      server: { select: { name: true, game: { select: { name: true } } } },
    },
  });
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export async function updatePricing(
  data: z.infer<typeof pricingConfigSchema>,
) {
  const active = await prisma.pricingConfig.findFirst({ where: { active: true } });
  if (active) {
    return prisma.pricingConfig.update({ where: { id: active.id }, data });
  }
  return prisma.pricingConfig.create({ data: { ...data, name: "default", active: true } });
}

export async function upsertGame(data: z.infer<typeof upsertGameSchema>) {
  const { id, versions, ...rest } = data;
  const payload = {
    ...rest,
    versions: serializeVersions(versions.split(",")),
    unavailableReason: rest.available ? null : (rest.unavailableReason ?? null),
    eggVariables: JSON.stringify(parseEggVariables(rest.eggVariables)),
  };
  if (id) {
    return prisma.game.update({ where: { id }, data: payload });
  }
  return prisma.game.create({ data: payload });
}

// --- servers ---------------------------------------------------------------

export async function listAllServers() {
  return prisma.server.findMany({
    where: { status: { not: "DELETED" } },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      game: { select: { name: true, slug: true } },
      region: { select: { name: true, flag: true, code: true } },
      subscription: { select: { status: true, currentPeriodEnd: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Takes a server offline for abuse or any other manual reason; blocks all power
 * actions. Billing is left alone: unlike a BILLING suspension (see
 * renewal-service), this one is never lifted automatically by a payment.
 */
export async function suspendServer(serverId: string, reason?: string) {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server || server.status === "DELETED") throw new AppError("server_not_found", 404);
  if (server.status === "SUSPENDED") {
    throw new AppError("invalid_transition", 409, "Server is already suspended.");
  }

  const ref = toRef(server);
  if (ref) await getProvider().suspend(ref);

  const updated = await prisma.server.update({
    where: { id: serverId },
    data: { status: "SUSPENDED", statusChangedAt: new Date(), suspensionReason: "ADMIN" },
  });

  await recordEvent(serverId, "SUSPENDED", reason);
  return updated;
}

/**
 * Lifts any suspension. If the subscription is still unpaid, the next billing
 * cycle suspends the server again.
 */
export async function unsuspendServer(serverId: string) {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server || server.status === "DELETED") throw new AppError("server_not_found", 404);
  if (server.status !== "SUSPENDED") {
    throw new AppError("invalid_transition", 409, "Server is not suspended.");
  }

  const ref = toRef(server);
  if (ref) await getProvider().unsuspend(ref);

  const updated = await prisma.server.update({
    where: { id: serverId },
    // A server that was never provisioned has nothing to boot; surface it as an error.
    data: {
      status: ref ? "STOPPED" : "ERROR",
      statusChangedAt: new Date(),
      suspensionReason: null,
    },
  });

  await recordEvent(serverId, "UNSUSPENDED");
  return updated;
}

// --- regions ---------------------------------------------------------------

export async function deleteRegion(id: string) {
  const inUse = await prisma.server.count({
    where: { regionId: id, status: { not: "DELETED" } },
  });
  if (inUse > 0) {
    // Keep referential integrity: hide it from the configurator instead.
    return prisma.region.update({ where: { id }, data: { active: false } });
  }
  return prisma.region.delete({ where: { id } });
}

export async function deleteGame(id: string) {
  const inUse = await prisma.server.count({
    where: { gameId: id, status: { not: "DELETED" } },
  });
  if (inUse > 0) {
    // Keep the catalog consistent: hide instead of deleting.
    return prisma.game.update({
      where: { id },
      data: { available: false, unavailableReason: "Temporarily unavailable." },
    });
  }
  return prisma.game.delete({ where: { id } });
}

export async function listRegions() {
  return prisma.region.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { servers: { where: { status: { not: "DELETED" } } } } },
    },
  });
}

/**
 * Regions are never deleted (servers reference them); deactivating one hides
 * it from the configurator and makes new orders for it fail validation.
 */
export async function upsertRegion(data: z.infer<typeof upsertRegionSchema>) {
  const { id, ...rest } = data;
  const clash = await prisma.region.findUnique({ where: { code: rest.code } });
  if (clash && clash.id !== id) throw new AppError("region_code_taken", 409);
  if (id) {
    return prisma.region.update({ where: { id }, data: rest });
  }
  return prisma.region.create({ data: rest });
}

// ---------------------------------------------------------------------------
// Provisioning backend
// ---------------------------------------------------------------------------

export type ProviderHealth =
  | { kind: "mock" }
  | { kind: "pterodactyl"; url: string; ok: boolean; error?: string };

export async function getProviderHealth(): Promise<ProviderHealth> {
  if (getServerProviderKind() === "mock") return { kind: "mock" };
  try {
    const { url } = getPterodactylConfig();
    await pteroApp.ping();
    return { kind: "pterodactyl", url, ok: true };
  } catch (error) {
    return {
      kind: "pterodactyl",
      url: process.env.PTERODACTYL_URL ?? "",
      ok: false,
      error: (error as Error).message,
    };
  }
}

function requirePterodactyl() {
  if (getServerProviderKind() !== "pterodactyl") {
    throw new AppError("provider_not_configured", 400);
  }
}

export type EggInspection = {
  name: string;
  dockerImages: string[];
  startup: string;
  variables: Array<{ env: string; defaultValue: string; required: boolean }>;
};

/** Reads an egg from the panel so the admin can check the IDs and variables. */
export async function inspectEgg(nestId: number, eggId: number): Promise<EggInspection> {
  requirePterodactyl();
  const egg = (await pteroApp.getEgg(nestId, eggId)).attributes;
  const images = Object.values(egg.docker_images ?? {});
  return {
    name: egg.name,
    dockerImages: images.length > 0 ? images : [egg.docker_image],
    startup: egg.startup,
    variables: (egg.relationships?.variables?.data ?? []).map(({ attributes: v }) => ({
      env: v.env_variable,
      defaultValue: v.default_value ?? "",
      required: /(^|\|)required(\||$)/.test(v.rules),
    })),
  };
}

export type LocationInspection = {
  short: string;
  long: string | null;
  nodes: Array<{ id: number; name: string; fqdn: string; memoryMb: number; allocatedMb: number | null }>;
};

export async function inspectLocation(locationId: number): Promise<LocationInspection> {
  requirePterodactyl();
  const location = (await pteroApp.getLocation(locationId)).attributes;
  return {
    short: location.short,
    long: location.long,
    nodes: (location.relationships?.nodes?.data ?? []).map(({ attributes: n }) => ({
      id: n.id,
      name: n.name,
      fqdn: n.fqdn,
      memoryMb: n.memory,
      allocatedMb: n.allocated_resources?.memory ?? null,
    })),
  };
}
