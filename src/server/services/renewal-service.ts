import { prisma } from "@/lib/db";
import { BILLING_POLICY } from "@/lib/constants";
import { addMonths } from "@/lib/dates";
import type { Prisma } from "@/generated/prisma/client";
import { MONTHS_PER_PERIOD } from "@/lib/pricing/types";
import { AppError } from "@/server/errors";
import { getPaymentProvider, type ChargeFn } from "@/server/payments";
import { getProvider } from "@/server/providers";
import { recordEvent } from "./event-service";
import { nextInvoiceNumber, voidPendingRenewals } from "./invoice-service";
import { toRef } from "./server-service";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export { BILLING_POLICY };

export type BillingCycleReport = {
  /** Periods paid for, including recoveries of past-due subscriptions. */
  renewed: number;
  /** Charge attempts that were declined in this run. */
  failed: number;
  /** Subscriptions that ended because the customer had cancelled. */
  cancelled: number;
  suspended: number;
  deleted: number;
};

type Deps = { charge?: ChargeFn };

const dueInclude = { server: true } satisfies Prisma.SubscriptionInclude;
type DueSubscription = Prisma.SubscriptionGetPayload<{ include: typeof dueInclude }>;

type AttemptResult = { paid: true } | { paid: false; reason: string };

/**
 * Bills one period of a subscription. Reuses the unpaid renewal order of an
 * earlier failed attempt, so a customer who stays past due for a week still
 * ends up with a single invoice for that period.
 */
async function attemptRenewal(
  sub: DueSubscription,
  now: Date,
  charge: ChargeFn,
): Promise<AttemptResult> {
  const creditUsed = Math.min(sub.creditCents, sub.amountCents);
  const totalCents = sub.amountCents - creditUsed;
  const attempt = sub.chargeAttempts + 1;

  let order = await prisma.order.findFirst({
    where: { serverId: sub.serverId, kind: "RENEWAL", status: "PENDING" },
  });

  if (order) {
    // Credit may have changed since the failed attempt (a downgrade in between).
    order = await prisma.order.update({
      where: { id: order.id },
      data: { creditAppliedCents: creditUsed, totalCents },
    });
    await prisma.invoice.updateMany({
      where: { orderId: order.id, status: "OPEN" },
      data: { amountCents: totalCents },
    });
  } else {
    const invoiceNumber = await nextInvoiceNumber();
    order = await prisma.order.create({
      data: {
        userId: sub.userId,
        serverId: sub.serverId,
        kind: "RENEWAL",
        status: "PENDING",
        billingPeriod: sub.billingPeriod,
        configSnapshot: JSON.stringify({
          name: sub.server.name,
          ramGb: sub.server.ramGb,
          vcpu: sub.server.vcpu,
          storageGb: sub.server.storageGb,
          periodStart: sub.currentPeriodEnd,
        }),
        subtotalCents: sub.amountCents,
        discountCents: 0,
        creditAppliedCents: creditUsed,
        totalCents,
        currency: sub.currency,
        invoices: {
          create: {
            number: invoiceNumber,
            userId: sub.userId,
            status: "OPEN",
            amountCents: totalCents,
            currency: sub.currency,
            issuedAt: now,
            dueAt: sub.currentPeriodEnd,
          },
        },
      },
    });
  }

  // Nothing to collect when credit covers the whole period.
  const result =
    totalCents === 0
      ? ({ status: "succeeded", reference: "credit" } as const)
      : await charge({
          orderId: order.id,
          idempotencyKey: `${order.id}:${attempt}`,
          userId: sub.userId,
          amountCents: totalCents,
          currency: sub.currency,
          description: `${sub.server.name} renewal`,
        });

  if (result.status === "failed") {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: "PAST_DUE",
        pastDueSince: sub.pastDueSince ?? now,
        lastChargeAttemptAt: now,
        chargeAttempts: attempt,
      },
    });
    await recordEvent(sub.serverId, "PAYMENT_FAILED", result.reason, { attempt, totalCents });
    return { paid: false, reason: result.reason };
  }

  const months = MONTHS_PER_PERIOD[sub.billingPeriod];
  const liftSuspension =
    sub.server.status === "SUSPENDED" && sub.server.suspensionReason === "BILLING";
  const orderId = order.id;

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { status: "PAID" } });
    await tx.invoice.updateMany({
      where: { orderId, status: "OPEN" },
      data: { status: "PAID", paidAt: now },
    });
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        status: "ACTIVE",
        // The period keeps its original anchor even when the payment came late.
        currentPeriodStart: sub.currentPeriodEnd,
        currentPeriodEnd: addMonths(sub.currentPeriodEnd, months),
        creditCents: sub.creditCents - creditUsed,
        pastDueSince: null,
        lastChargeAttemptAt: now,
        chargeAttempts: 0,
      },
    });
    if (liftSuspension) {
      await tx.server.update({
        where: { id: sub.serverId },
        data: { status: "STOPPED", statusChangedAt: now, suspensionReason: null },
      });
    }
  });

  await recordEvent(sub.serverId, "RENEWED", undefined, { totalCents, creditUsed });
  if (liftSuspension) await recordEvent(sub.serverId, "UNSUSPENDED", "Payment received");
  return { paid: true };
}

async function suspendForBilling(serverId: string, now: Date, reason: string) {
  await prisma.server.update({
    where: { id: serverId },
    data: { status: "SUSPENDED", statusChangedAt: now, suspensionReason: "BILLING" },
  });
  await recordEvent(serverId, "SUSPENDED", reason);
}

async function deleteForBilling(sub: DueSubscription, now: Date, reason: string) {
  const ref = toRef(sub.server);
  if (ref) await getProvider().deleteServer(ref);

  await prisma.$transaction([
    prisma.server.update({
      where: { id: sub.serverId },
      data: { status: "DELETED", statusChangedAt: now, suspensionReason: null },
    }),
    prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: sub.status === "CANCELLED" ? "CANCELLED" : "EXPIRED",
        pastDueSince: null,
      },
    }),
  ]);
  await voidPendingRenewals(sub.serverId);
  await recordEvent(sub.serverId, "DELETED", reason);
}

/**
 * One pass of the billing engine. Meant to run from a scheduler (hourly is
 * plenty); every step looks at timestamps rather than at when it last ran, so
 * running it more often, or after an outage, is harmless.
 */
export async function runBillingCycle(
  now: Date = new Date(),
  deps: Deps = {},
): Promise<BillingCycleReport> {
  const charge = deps.charge ?? ((request) => getPaymentProvider().chargeSaved(request));
  const report: BillingCycleReport = {
    renewed: 0,
    failed: 0,
    cancelled: 0,
    suspended: 0,
    deleted: 0,
  };
  const liveServer = { status: { not: "DELETED" } } satisfies Prisma.ServerWhereInput;

  // 1. Periods that ended: either the customer cancelled, or we renew.
  const due = await prisma.subscription.findMany({
    where: { status: "ACTIVE", currentPeriodEnd: { lte: now }, server: liveServer },
    include: dueInclude,
  });

  for (const first of due) {
    if (first.cancelAtPeriodEnd) {
      await prisma.subscription.update({
        where: { id: first.id },
        data: { status: "CANCELLED", cancelAtPeriodEnd: false },
      });
      if (first.server.status !== "SUSPENDED") {
        await suspendForBilling(first.serverId, now, "Subscription ended");
      }
      report.cancelled += 1;
      continue;
    }

    let sub = first;
    for (let i = 0; i < BILLING_POLICY.maxCatchUpPeriods; i += 1) {
      const result = await attemptRenewal(sub, now, charge);
      if (!result.paid) {
        report.failed += 1;
        break;
      }
      report.renewed += 1;
      sub = await prisma.subscription.findUniqueOrThrow({
        where: { id: sub.id },
        include: dueInclude,
      });
      if (sub.currentPeriodEnd > now) break;
    }
  }

  // 2. Unpaid subscriptions: delete, retry, or suspend, in that order.
  const pastDue = await prisma.subscription.findMany({
    where: { status: "PAST_DUE", server: liveServer },
    include: dueInclude,
  });

  for (const sub of pastDue) {
    const since = sub.pastDueSince ?? now;
    const unpaidMs = now.getTime() - since.getTime();

    if (unpaidMs >= BILLING_POLICY.deleteAfterDays * DAY_MS) {
      await deleteForBilling(sub, now, "Unpaid");
      report.deleted += 1;
      continue;
    }

    const lastAttempt = sub.lastChargeAttemptAt?.getTime() ?? 0;
    if (now.getTime() - lastAttempt >= BILLING_POLICY.retryEveryHours * HOUR_MS) {
      const result = await attemptRenewal(sub, now, charge);
      if (result.paid) {
        report.renewed += 1;
        continue;
      }
      report.failed += 1;
    }

    if (
      unpaidMs >= BILLING_POLICY.suspendAfterDays * DAY_MS &&
      sub.server.status !== "SUSPENDED"
    ) {
      await suspendForBilling(sub.serverId, now, "Unpaid");
      report.suspended += 1;
    }
  }

  // 3. Cancelled subscriptions whose data-retention window is over.
  const retentionOver = new Date(now.getTime() - BILLING_POLICY.deleteAfterDays * DAY_MS);
  const ended = await prisma.subscription.findMany({
    where: {
      status: "CANCELLED",
      currentPeriodEnd: { lte: retentionOver },
      server: { status: "SUSPENDED", suspensionReason: "BILLING" },
    },
    include: dueInclude,
  });

  for (const sub of ended) {
    await deleteForBilling(sub, now, "Subscription ended");
    report.deleted += 1;
  }

  return report;
}

/** Customer-initiated retry of an unpaid renewal ("Pay now"). */
export async function payOutstanding(
  subscriptionId: string,
  userId: string,
  deps: Deps = {},
  now: Date = new Date(),
) {
  const sub = await prisma.subscription.findFirst({
    where: { id: subscriptionId, userId, server: { status: { not: "DELETED" } } },
    include: dueInclude,
  });
  if (!sub) throw new AppError("subscription_not_found", 404);
  if (sub.status !== "PAST_DUE") throw new AppError("nothing_due", 409);

  const charge = deps.charge ?? ((request) => getPaymentProvider().chargeSaved(request));
  const result = await attemptRenewal(sub, now, charge);
  if (!result.paid) throw new AppError("payment_failed", 402, result.reason);

  return prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
}

// --- admin -------------------------------------------------------------------

/** What the admin billing page shows: what is about to renew and what is unpaid. */
export async function getBillingOverview(now: Date = new Date()) {
  const soon = new Date(now.getTime() + 7 * DAY_MS);
  const include = {
    user: { select: { email: true, name: true } },
    server: { select: { id: true, name: true, status: true } },
  } satisfies Prisma.SubscriptionInclude;

  const [upcoming, pastDue, activeCount, mrr] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: "ACTIVE", currentPeriodEnd: { lte: soon } },
      include,
      orderBy: { currentPeriodEnd: "asc" },
      take: 50,
    }),
    prisma.subscription.findMany({
      where: { status: "PAST_DUE" },
      include,
      orderBy: { pastDueSince: "asc" },
      take: 50,
    }),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.subscription.findMany({
      where: { status: "ACTIVE" },
      select: { amountCents: true, billingPeriod: true },
    }),
  ]);

  const monthlyRecurringCents = mrr.reduce(
    (sum, sub) => sum + Math.round(sub.amountCents / MONTHS_PER_PERIOD[sub.billingPeriod]),
    0,
  );

  return { upcoming, pastDue, activeCount, monthlyRecurringCents };
}
