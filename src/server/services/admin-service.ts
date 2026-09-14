import { prisma } from "@/lib/db";
import { serializeVersions } from "@/lib/games";
import type { z } from "zod";
import type {
  pricingConfigSchema,
  upsertGameSchema,
} from "@/lib/validation/admin";

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
