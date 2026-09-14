import { prisma } from "@/lib/db";
import { addMonths } from "@/lib/dates";
import { MONTHS_PER_PERIOD } from "@/lib/pricing/types";
import type { CreateServerInput } from "@/lib/validation/server";
import { quote } from "./pricing-service";
import { provisionServer } from "./server-service";

async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const count = await prisma.invoice.count({
    where: { number: { startsWith: `GH-${year}-` } },
  });
  return `GH-${year}-${String(count + 1).padStart(6, "0")}`;
}

/**
 * Simulated checkout (Phase 1). Recomputes the price server-side, records the
 * order as paid, issues an invoice, provisions the server and opens a
 * subscription. When Stripe lands, the "mark as paid" part moves to the
 * webhook handler and everything else stays the same.
 */
export async function checkoutMock(userId: string, input: CreateServerInput) {
  const { breakdown, game, region } = await quote(input);

  const order = await prisma.order.create({
    data: {
      userId,
      status: "PENDING",
      billingPeriod: input.billingPeriod,
      configSnapshot: JSON.stringify({
        name: input.name,
        gameSlug: game.slug,
        gameName: game.name,
        gameVersion: input.gameVersion ?? null,
        regionCode: region.code,
        regionName: region.name,
        ramGb: input.ramGb,
        vcpu: input.vcpu,
        storageGb: input.storageGb,
        breakdown,
      }),
      subtotalCents: breakdown.subtotalCents,
      discountCents: breakdown.discountCents,
      totalCents: breakdown.totalCents,
      currency: breakdown.currency,
    },
  });

  // --- simulated payment gateway --------------------------------------------
  const paidAt = new Date();
  const invoiceNumber = await nextInvoiceNumber();

  const server = await provisionServer({
    userId,
    name: input.name,
    gameId: game.id,
    gameSlug: game.slug,
    gameVersion: input.gameVersion,
    regionId: region.id,
    regionCode: region.code,
    ramGb: input.ramGb,
    vcpu: input.vcpu,
    storageGb: input.storageGb,
  });

  const months = MONTHS_PER_PERIOD[input.billingPeriod];

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: { status: "PAID", serverId: server.id },
    }),
    prisma.invoice.create({
      data: {
        number: invoiceNumber,
        userId,
        orderId: order.id,
        status: "PAID",
        amountCents: breakdown.totalCents,
        currency: breakdown.currency,
        issuedAt: paidAt,
        dueAt: paidAt,
        paidAt,
      },
    }),
    prisma.subscription.create({
      data: {
        userId,
        serverId: server.id,
        orderId: order.id,
        status: "ACTIVE",
        billingPeriod: input.billingPeriod,
        amountCents: breakdown.totalCents,
        currency: breakdown.currency,
        currentPeriodStart: paidAt,
        currentPeriodEnd: addMonths(paidAt, months),
      },
    }),
  ]);

  return { orderId: order.id, serverId: server.id };
}

export async function listOrdersForUser(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    include: { server: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function listInvoicesForUser(userId: string) {
  return prisma.invoice.findMany({
    where: { userId },
    include: { order: { select: { id: true, configSnapshot: true } } },
    orderBy: { issuedAt: "desc" },
  });
}

export async function listSubscriptionsForUser(userId: string) {
  return prisma.subscription.findMany({
    where: { userId },
    include: {
      server: { include: { game: true, region: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function setCancelAtPeriodEnd(
  subscriptionId: string,
  userId: string,
  cancel: boolean,
) {
  const sub = await prisma.subscription.findFirst({
    where: { id: subscriptionId, userId },
  });
  if (!sub) return null;
  return prisma.subscription.update({
    where: { id: sub.id },
    data: { cancelAtPeriodEnd: cancel },
  });
}
