import { prisma } from "@/lib/db";
import { addMonths } from "@/lib/dates";
import { MONTHS_PER_PERIOD } from "@/lib/pricing/types";
import type { CreateServerInput } from "@/lib/validation/server";
import { quote } from "./pricing-service";
import { createServerRecord, provisionServer, type ServerSpec } from "./server-service";

/** Next invoice number for the current year (GH-2026-000042), safe under concurrent checkouts. */
async function allocateInvoiceNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `GH-${year}-`;
  // The first time a year's counter is created, continue after invoices
  // issued before the counter existed.
  const existing = await prisma.invoiceCounter.findUnique({ where: { year } });
  const issued = existing
    ? 0
    : await prisma.invoice.count({ where: { number: { startsWith: prefix } } });
  const counter = await prisma.invoiceCounter.upsert({
    where: { year },
    create: { year, last: issued + 1 },
    update: { last: { increment: 1 } },
  });
  return `${prefix}${String(counter.last).padStart(6, "0")}`;
}

/**
 * Simulated checkout (Phase 1). Recomputes the price server-side, provisions
 * the server and only then records the payment, invoice and subscription, so a
 * failed provisioning never bills the customer. When Stripe lands, the part
 * after provisioning moves to the payment webhook.
 */
export async function checkoutMock(userId: string, input: CreateServerInput) {
  const { breakdown, game, region } = await quote(input);

  const spec: ServerSpec = {
    userId,
    name: input.name,
    gameVersion: input.gameVersion,
    ramGb: input.ramGb,
    vcpu: input.vcpu,
    storageGb: input.storageGb,
    game,
    region,
  };

  const record = await createServerRecord(spec);
  const order = await prisma.order.create({
    data: {
      userId,
      serverId: record.id,
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

  let server;
  try {
    server = await provisionServer(record, spec);
  } catch (error) {
    await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    throw error;
  }

  // --- simulated payment gateway --------------------------------------------
  const paidAt = new Date();
  const invoiceNumber = await allocateInvoiceNumber();
  const months = MONTHS_PER_PERIOD[input.billingPeriod];

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: { status: "PAID" },
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
