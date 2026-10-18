import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { calculatePrice } from "@/lib/pricing/calculate-price";
import { prorate, type ProrateResult } from "@/lib/pricing/prorate";
import { MONTHS_PER_PERIOD } from "@/lib/pricing/types";
import type { ResizeServerInput } from "@/lib/validation/server";
import { AppError } from "@/server/errors";
import { getPaymentProvider, type ChargeFn } from "@/server/payments";
import { getProvider } from "@/server/providers";
import { recordEvent } from "./event-service";
import { claimInvoiceNumber } from "./invoice-service";
import { assertMeetsMinimums, getActivePricing, toPricingTable } from "./pricing-service";
import { getServerForUser, serverInclude, toRef } from "./server-service";

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
  deps: { charge?: ChargeFn } = {},
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
      // Settled below: an upgrade only goes through once it has been paid for.
      status: "PENDING",
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

  const ref = toRef(server);
  const nextSpec = { ramGb: input.ramGb, vcpu: input.vcpu, storageGb: input.storageGb };
  const previousSpec = {
    ramGb: server.ramGb,
    vcpu: server.vcpu,
    storageGb: server.storageGb,
  };

  // Before the charge, not after. The likely failure is the node having no room
  // to grow, and a customer should not pay for memory the panel just refused.
  // It throws, which marks the order FAILED below rather than leaving it
  // PENDING for ever.
  if (ref) {
    try {
      await getProvider().resize(ref, nextSpec);
    } catch (error) {
      await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
      throw error;
    }
  }

  let payment: { paymentProvider: string; paymentReference: string } | undefined;
  if (chargeCents > 0) {
    const charge = deps.charge ?? ((request) => getPaymentProvider().chargeSaved(request));
    const result = await charge({
      orderId: order.id,
      idempotencyKey: `${order.id}:1`,
      userId,
      amountCents: chargeCents,
      currency: preview.currency,
      description: `${server.name} upgrade`,
    });
    if (result.status === "failed") {
      // The server already has the new resources and nobody paid for them.
      // Best effort, because the declined card is what the customer needs to
      // hear about; a failed rollback is an admin's problem, not theirs.
      if (ref) {
        try {
          await getProvider().resize(ref, previousSpec);
        } catch (rollbackError) {
          console.error(
            `[resize] could not roll ${server.id} back after a declined card`,
            rollbackError,
          );
          await prisma.server.update({
            where: { id: server.id },
            data: {
              lastError: `Resize was applied but the payment failed, and the rollback did not go through: ${
                rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
              }`,
            },
          });
        }
      }
      await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
      throw new AppError("payment_failed", 402, result.reason);
    }
    payment = {
      paymentProvider: getPaymentProvider().name,
      paymentReference: result.reference,
    };
  }

  // Rebuilt per attempt: a PrismaPromise can only be awaited once, and the
  // invoice number may have to be taken again if another writer got it first.
  const buildWrites = (invoiceNumber: string | null) => {
    const writes: Prisma.PrismaPromise<unknown>[] = [
      prisma.order.update({ where: { id: order.id }, data: { status: "PAID", ...payment } }),
      prisma.server.update({
        where: { id: server.id },
        data: { ramGb: input.ramGb, vcpu: input.vcpu, storageGb: input.storageGb },
      }),
    ];

    if (invoiceNumber) {
      writes.push(
        prisma.invoice.create({
          data: {
            number: invoiceNumber,
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

    return writes;
  };

  // Upgrades are invoiced immediately; downgrades only create a credit. The
  // card has already been charged by this point, so a number taken by a
  // concurrent writer must be retried rather than surfaced as a failure.
  if (chargeCents > 0) {
    await claimInvoiceNumber((number) => prisma.$transaction(buildWrites(number)));
  } else {
    await prisma.$transaction(buildWrites(null));
  }

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
