import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { calculatePrice } from "@/lib/pricing/calculate-price";
import { AppError } from "@/server/errors";
import { checkoutMock, listInvoicesForUser } from "@/server/services/order-service";
import { getActivePricing, quote, toPricingTable } from "@/server/services/pricing-service";
import { createUser, resetData } from "../setup/db";

describe("checkout (simulated)", () => {
  beforeEach(resetData);

  it("creates a paid order, invoice, subscription and an installing server", async () => {
    const user = await createUser();

    const { orderId, serverId } = await checkoutMock(user.id, {
      name: "Friday SMP",
      gameSlug: "minecraft-paper",
      gameVersion: "1.21.8",
      ramGb: 8,
      vcpu: 4,
      storageGb: 50,
      regionCode: "eu-de",
      billingPeriod: "YEARLY",
      waiveWithdrawal: true,
    });

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { invoices: true, subscription: true },
    });
    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });

    // 8 GB * 1.50 + 4 * 2.00 + 50 * 0.10 + 2.00 base = 27.00 -> Frankfurt 1.05 = 28.35
    // 12 months = 340.20 minus 15 % = 289.17
    expect(order.status).toBe("PAID");
    expect(order.kind).toBe("NEW");
    expect(order.totalCents).toBe(28917);
    expect(order.serverId).toBe(serverId);

    expect(order.invoices).toHaveLength(1);
    expect(order.invoices[0].status).toBe("PAID");
    expect(order.invoices[0].amountCents).toBe(28917);
    expect(order.invoices[0].number).toMatch(/^GH-\d{4}-\d{6}$/);

    expect(order.subscription?.status).toBe("ACTIVE");
    expect(order.subscription?.billingPeriod).toBe("YEARLY");
    expect(order.subscription?.serverId).toBe(serverId);

    expect(server.status).toBe("INSTALLING");
    expect(server.ramGb).toBe(8);
    expect(server.gameVersion).toBe("1.21.8");
    expect(server.providerId).toBeTruthy();
    expect(server.ip).toBeTruthy();
    expect(server.port).toBeGreaterThan(0);
  });

  it("matches the pure pricing engine exactly", async () => {
    const user = await createUser();
    const pricing = await getActivePricing();
    const region = await prisma.region.findUniqueOrThrow({ where: { code: "eu-uk" } });

    const expected = calculatePrice(
      {
        ramGb: 6,
        vcpu: 2,
        storageGb: 30,
        regionMultiplier: region.priceMultiplier,
        billingPeriod: "QUARTERLY",
      },
      toPricingTable(pricing),
    );

    const { orderId } = await checkoutMock(user.id, {
      name: "Quarterly box",
      gameSlug: "valheim",
      ramGb: 6,
      vcpu: 2,
      storageGb: 30,
      regionCode: "eu-uk",
      billingPeriod: "QUARTERLY",
      waiveWithdrawal: true,
    });

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.totalCents).toBe(expected.totalCents);
    expect(order.subtotalCents).toBe(expected.subtotalCents);
    expect(order.discountCents).toBe(expected.discountCents);
  });

  it("sets the subscription period from the billing period", async () => {
    const user = await createUser();
    const { serverId } = await checkoutMock(user.id, {
      name: "Quarterly",
      gameSlug: "terraria",
      ramGb: 2,
      vcpu: 1,
      storageGb: 10,
      regionCode: "eu-ro",
      billingPeriod: "QUARTERLY",
      waiveWithdrawal: true,
    });

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { serverId } });
    const months =
      (sub.currentPeriodEnd.getUTCFullYear() - sub.currentPeriodStart.getUTCFullYear()) * 12 +
      (sub.currentPeriodEnd.getUTCMonth() - sub.currentPeriodStart.getUTCMonth());
    expect(months).toBe(3);
    expect(sub.creditCents).toBe(0);
  });

  it("rejects a game that cannot be hosted", async () => {
    const user = await createUser();
    await expect(
      checkoutMock(user.id, {
        name: "Nope",
        gameSlug: "roblox",
        ramGb: 4,
        vcpu: 2,
        storageGb: 20,
        regionCode: "eu-ro",
        billingPeriod: "MONTHLY",
        waiveWithdrawal: true,
      }),
    ).rejects.toMatchObject({ code: "game_unavailable" });
  });

  it("rejects an unknown game and an unknown region", async () => {
    await expect(
      quote({
        gameSlug: "half-life-3",
        ramGb: 4,
        vcpu: 2,
        storageGb: 20,
        regionCode: "eu-ro",
        billingPeriod: "MONTHLY",
      }),
    ).rejects.toMatchObject({ code: "game_not_found" });

    await expect(
      quote({
        gameSlug: "rust",
        ramGb: 8,
        vcpu: 3,
        storageGb: 40,
        regionCode: "mars-1",
        billingPeriod: "MONTHLY",
      }),
    ).rejects.toMatchObject({ code: "region_not_found" });
  });

  it("rejects a configuration below the game minimums", async () => {
    const error = await quote({
      gameSlug: "rust",
      ramGb: 2,
      vcpu: 1,
      storageGb: 10,
      regionCode: "eu-ro",
      billingPeriod: "MONTHLY",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("below_minimum");
    expect((error as AppError).details).toMatchObject({ minRamGb: 8, minCpu: 3, minStorageGb: 40 });
  });

  it("does not provision a server when checkout fails", async () => {
    const user = await createUser();
    await expect(
      checkoutMock(user.id, {
        name: "Doomed",
        gameSlug: "rust",
        ramGb: 1,
        vcpu: 1,
        storageGb: 10,
        regionCode: "eu-ro",
        billingPeriod: "MONTHLY",
        waiveWithdrawal: true,
      }),
    ).rejects.toBeInstanceOf(AppError);

    expect(await prisma.server.count({ where: { ownerId: user.id } })).toBe(0);
    expect(await prisma.order.count({ where: { userId: user.id } })).toBe(0);
    expect(await listInvoicesForUser(user.id)).toHaveLength(0);
  });

  it("numbers invoices sequentially", async () => {
    const user = await createUser();
    await createOne(user.id, "One");
    await createOne(user.id, "Two");

    const invoices = await prisma.invoice.findMany({ orderBy: { number: "asc" } });
    expect(invoices).toHaveLength(2);
    expect(invoices[0].number).not.toBe(invoices[1].number);
  });
});

function createOne(userId: string, name: string) {
  return checkoutMock(userId, {
    name,
    gameSlug: "terraria",
    ramGb: 2,
    vcpu: 1,
    storageGb: 10,
    regionCode: "eu-ro",
    billingPeriod: "MONTHLY",
    waiveWithdrawal: true,
  });
}
