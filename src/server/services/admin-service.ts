import { prisma } from "@/lib/db";
import { serializeVersions } from "@/lib/games";
import type { z } from "zod";
import type {
  pricingConfigSchema,
  upsertGameSchema,
  upsertRegionSchema,
} from "@/lib/validation/admin";
import { AppError } from "@/server/errors";
import { recordEvent } from "./event-service";

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

  const updated = await prisma.server.update({
    where: { id: serverId },
    data: { status: "STOPPED", statusChangedAt: new Date(), suspensionReason: null },
  });

  await recordEvent(serverId, "UNSUSPENDED");
  return updated;
}

// --- regions ---------------------------------------------------------------

export async function listRegions() {
  return prisma.region.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function upsertRegion(data: z.infer<typeof upsertRegionSchema>) {
  const { id, ...rest } = data;
  if (id) return prisma.region.update({ where: { id }, data: rest });
  return prisma.region.create({ data: rest });
}

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
