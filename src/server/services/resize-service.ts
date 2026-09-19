import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { calculatePrice } from "@/lib/pricing/calculate-price";
import { prorate, type ProrateResult } from "@/lib/pricing/prorate";
import { MONTHS_PER_PERIOD } from "@/lib/pricing/types";
import type { ResizeServerInput } from "@/lib/validation/server";
import { AppError } from "@/server/errors";
import { recordEvent } from "./event-service";
import { nextInvoiceNumber } from "./order-service";
import { assertMeetsMinimums, getActivePricing, toPricingTable } from "./pricing-service";
import { getServerForUser, serverInclude } from "./server-service";

/** Resources may only be changed while the server sits in a stable state. */
const RESIZABLE_STATUSES = ["STOPPED", "RUNNING"] as const;

export type ResizePreview = {
  currency: string;
  oldMonthlyCents: number;
  newMonthlyCents: number;
  /** New recurring amount per billing period, discounts included. */
  newPeriodCents: number;
  months: number;
  proration: ProrateResult;
  current: { ramGb: number; vcpu: number; storageGb: number };
  next: { ramGb: number; vcpu: number; storageGb: number };
  changed: boolean;
};

async function buildPreview(
  serverId: string,
  userId: string,
  input: ResizeServerInput,
  now: Date,
): Promise<{ preview: ResizePreview; server: Awaited<ReturnType<typeof getServerForUser>> }> {
  const server = await getServerForUser(serverId, userId);

  if (!RESIZABLE_STATUSES.includes(server.status as (typeof RESIZABLE_STATUSES)[number])) {
    throw new AppError(
      "invalid_transition",
      409,
      `Cannot resize a server that is ${server.status}.`,
    );
  }

  assertMeetsMinimums(server.game, input);

  const pricing = toPricingTable(await getActivePricing());
  const sub = server.subscription;
  const billingPeriod = sub?.billingPeriod ?? "MONTHLY";
  const months = MONTHS_PER_PERIOD[billingPeriod];

  const priceFor = (config: { ramGb: number; vcpu: number; storageGb: number }, period = billingPeriod) =>
    calculatePrice(
      {
        ramGb: config.ramGb,
        vcpu: config.vcpu,
        storageGb: config.storageGb,
        regionMultiplier: server.region.priceMultiplier,
        billingPeriod: period,
      },
      pricing,
    );

  const current = { ramGb: server.ramGb, vcpu: server.vcpu, storageGb: server.storageGb };
  const next = { ramGb: input.ramGb, vcpu: input.vcpu, storageGb: input.storageGb };

  const oldMonthlyCents = priceFor(current, "MONTHLY").monthlyCents;
  const newMonthlyCents = priceFor(next, "MONTHLY").monthlyCents;
  const newPeriodCents = priceFor(next).totalCents;

  const proration = sub
    ? prorate({
        oldMonthlyCents,
        newMonthlyCents,
        months,
        periodStart: sub.currentPeriodStart,
        periodEnd: sub.currentPeriodEnd,
        now,
      })
    : { remainingFraction: 0, deltaCents: 0, chargeCents: 0, creditCents: 0 };

  return {
    server,
    preview: {
      currency: pricing.currency,
      oldMonthlyCents,
      newMonthlyCents,
      newPeriodCents,
      months,
      proration,
      current,
      next,
      changed:
        current.ramGb !== next.ramGb ||
        current.vcpu !== next.vcpu ||
        current.storageGb !== next.storageGb,
    },
  };
}

/** Read-only price preview shown in the resize dialog. */
export async function previewResize(
  serverId: string,
  userId: string,
  input: ResizeServerInput,
  now = new Date(),
): Promise<ResizePreview> {
  const { preview } = await buildPreview(serverId, userId, input, now);
  return preview;
}

/**
 * Applies a resource change: updates the server, bills the prorated difference
 * (or records a credit for a downgrade) and adjusts the recurring amount.
 */
export async function resizeServer(
  serverId: string,
  userId: string,
  input: ResizeServerInput,
  now = new Date(),
) {
  const { preview, server } = await buildPreview(serverId, userId, input, now);

  if (!preview.changed) {
    throw new AppError("no_change", 400, "The configuration is identical to the current one.");
  }

  const sub = server.subscription;
  const { chargeCents, creditCents } = preview.proration;

  const order = await prisma.order.create({
    data: {
      userId,
      serverId: server.id,
      kind: "RESIZE",
      status: "PAID",
      billingPeriod: sub?.billingPeriod ?? "MONTHLY",
      configSnapshot: JSON.stringify({
        from: preview.current,
        to: preview.next,
        oldMonthlyCents: preview.oldMonthlyCents,
        newMonthlyCents: preview.newMonthlyCents,
        remainingFraction: preview.proration.remainingFraction,
        creditCents,
      }),
      subtotalCents: chargeCents,
      discountCents: 0,
      totalCents: chargeCents,
      currency: preview.currency,
    },
  });

  const writes: Prisma.PrismaPromise<unknown>[] = [
    prisma.server.update({
      where: { id: server.id },
      data: { ramGb: input.ramGb, vcpu: input.vcpu, storageGb: input.storageGb },
    }),
  ];

  // Upgrades are invoiced immediately; downgrades only create a credit.
  if (chargeCents > 0) {
    writes.push(
      prisma.invoice.create({
        data: {
          number: await nextInvoiceNumber(),
          userId,
          orderId: order.id,
          status: "PAID",
          amountCents: chargeCents,
          currency: preview.currency,
          issuedAt: now,
          dueAt: now,
          paidAt: now,
        },
      }),
    );
  }

  if (sub) {
    writes.push(
      prisma.subscription.update({
        where: { id: sub.id },
        data: {
          amountCents: preview.newPeriodCents,
          creditCents: sub.creditCents + creditCents,
        },
      }),
    );
  }

  await prisma.$transaction(writes);

  await recordEvent(server.id, "RESIZED", undefined, {
    from: preview.current,
    to: preview.next,
    chargeCents,
    creditCents,
  });

  const updated = await prisma.server.findUniqueOrThrow({
    where: { id: server.id },
    include: serverInclude,
  });

  return { server: updated, orderId: order.id, preview };
}
