import { prisma } from "@/lib/db";
import { BILLING_POLICY } from "@/lib/constants";
import { addMonths } from "@/lib/dates";
import type { Prisma } from "@/generated/prisma/client";
import { MONTHS_PER_PERIOD } from "@/lib/pricing/types";
import { AppError } from "@/server/errors";
import { getPaymentProvider, type ChargeFn } from "@/server/payments";
import { getProvider } from "@/server/providers";
import { recordEvent } from "./event-service";
import { withJobLock } from "./job-lock";
import { nextInvoiceNumber, voidPendingRenewals } from "./invoice-service";
import {
  notifyPaymentFailed,
  notifyRenewalPaid,
  notifyRenewalUpcoming,
  notifyServerDeleted,
  notifyServerSuspended,
} from "./notification-service";
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
  /** Customers warned that their card is about to be charged. */
  noticesSent: number;
  /** Subscriptions skipped because something unexpected went wrong (see logs). */
  errors: number;
  /** True when another run already held the lock, so this one did nothing. */
  skipped?: boolean;
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
    // One email for the first failure; the daily retries that follow stay quiet
    // until the suspension notice.
    if (attempt === 1) await notifyPaymentFailed(sub.serverId, totalCents, sub.currency);
    return { paid: false, reason: result.reason };
  }

  const months = MONTHS_PER_PERIOD[sub.billingPeriod];
  const liftSuspension =
    sub.server.status === "SUSPENDED" && sub.server.suspensionReason === "BILLING";
  const orderId = order.id;

  // The card has already been charged, so a panel outage must not roll the
  // renewal back. Unlike the suspend path this one swallows the error and
  // records it: the customer's payment is written either way, and an admin (or
  // a manual unsuspend) fixes a server the panel refused to bring back.
  let unsuspendError: string | null = null;
  if (liftSuspension) {
    const ref = toRef(sub.server);
    if (ref) {
      try {
        await getProvider().unsuspend(ref);
      } catch (error) {
        unsuspendError = error instanceof Error ? error.message : String(error);
        console.error(`[billing] unsuspend failed for server ${sub.serverId}`, error);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "PAID",
        // Nothing was collected when credit covered the whole period.
        ...(totalCents > 0
          ? { paymentProvider: getPaymentProvider().name, paymentReference: result.reference }
          : {}),
      },
    });
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
        data: {
          // Still suspended on the panel: say so rather than showing it stopped.
          status: unsuspendError ? "ERROR" : "STOPPED",
          statusChangedAt: now,
          suspensionReason: null,
          ...(unsuspendError ? { lastError: unsuspendError } : {}),
        },
      });
    }
  });

  await recordEvent(sub.serverId, "RENEWED", undefined, { totalCents, creditUsed });
  await notifyRenewalPaid(orderId);
  if (liftSuspension) {
    await recordEvent(
      sub.serverId,
      "UNSUSPENDED",
      unsuspendError ? `Payment received, but the panel refused: ${unsuspendError}` : "Payment received",
    );
  }
  return { paid: true };
}

async function suspendForBilling(
  serverId: string,
  now: Date,
  reason: "Unpaid" | "Subscription ended",
) {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  const ref = server ? toRef(server) : null;
  // Suspending in the database alone leaves the server running on the panel,
  // and the next status sync then overwrites SUSPENDED with the live RUNNING —
  // so every cycle would re-suspend it and re-send the notice. A provider
  // failure aborts here on purpose: the next run retries.
  if (ref) await getProvider().suspend(ref);

  await prisma.server.update({
    where: { id: serverId },
    data: { status: "SUSPENDED", statusChangedAt: now, suspensionReason: "BILLING" },
  });
  await recordEvent(serverId, "SUSPENDED", reason);
  // A customer who cancelled knows why the server stopped; only non-payment
  // needs the warning about deletion.
  if (reason === "Unpaid") await notifyServerSuspended(serverId);
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
  await notifyServerDeleted(sub.serverId);
}

/**
 * One pass of the billing engine. Meant to run from a scheduler (hourly is
 * plenty); every step looks at timestamps rather than at when it last ran, so
 * running it more often, or after an outage, is harmless.
 *
 * Only one run at a time, though: the steps below read subscriptions and then
 * act on them without claiming each row, so two overlapping runs would each
 * create a renewal order for the same period and charge the card twice.
 */
export async function runBillingCycle(
  now: Date = new Date(),
  deps: Deps = {},
): Promise<BillingCycleReport> {
  const report = await withJobLock("billing-cycle", () => billingCyclePass(now, deps), { now });
  return (
    report ?? {
      renewed: 0,
      failed: 0,
      cancelled: 0,
      suspended: 0,
      deleted: 0,
      noticesSent: 0,
      errors: 0,
      skipped: true,
    }
  );
}

async function billingCyclePass(now: Date, deps: Deps): Promise<BillingCycleReport> {
  const charge = deps.charge ?? ((request) => getPaymentProvider().chargeSaved(request));
  const report: BillingCycleReport = {
    renewed: 0,
    failed: 0,
    cancelled: 0,
    suspended: 0,
    deleted: 0,
    noticesSent: 0,
    errors: 0,
  };
  // A gateway outage while billing one customer must not stop the run for the
  // rest, and must not be mistaken for a declined card either: the subscription
  // is simply picked up again by the next run.
  const guarded = async (subscriptionId: string, work: () => Promise<void>) => {
    try {
      await work();
    } catch (error) {
      report.errors += 1;
      console.error(`Billing cycle failed for subscription ${subscriptionId}`, error);
    }
  };
  const liveServer = { status: { not: "DELETED" } } satisfies Prisma.ServerWhereInput;

  // 1. Periods that ended: either the customer cancelled, or we renew.
  const due = await prisma.subscription.findMany({
    where: { status: "ACTIVE", currentPeriodEnd: { lte: now }, server: liveServer },
    include: dueInclude,
  });

  for (const first of due) {
    await guarded(first.id, async () => {
      if (first.cancelAtPeriodEnd) {
        await prisma.subscription.update({
          where: { id: first.id },
          data: { status: "CANCELLED", cancelAtPeriodEnd: false },
        });
        if (first.server.status !== "SUSPENDED") {
          await suspendForBilling(first.serverId, now, "Subscription ended");
        }
        report.cancelled += 1;
        return;
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
    });
  }

  // 2. Unpaid subscriptions: delete, retry, or suspend, in that order.
  const pastDue = await prisma.subscription.findMany({
    where: { status: "PAST_DUE", server: liveServer },
    include: dueInclude,
  });

  for (const sub of pastDue) {
    await guarded(sub.id, async () => {
      const since = sub.pastDueSince ?? now;
      const unpaidMs = now.getTime() - since.getTime();

      if (unpaidMs >= BILLING_POLICY.deleteAfterDays * DAY_MS) {
        await deleteForBilling(sub, now, "Unpaid");
        report.deleted += 1;
        return;
      }

      const lastAttempt = sub.lastChargeAttemptAt?.getTime() ?? 0;
      if (now.getTime() - lastAttempt >= BILLING_POLICY.retryEveryHours * HOUR_MS) {
        const result = await attemptRenewal(sub, now, charge);
        if (result.paid) {
          report.renewed += 1;
          return;
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
    });
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
    await guarded(sub.id, async () => {
      await deleteForBilling(sub, now, "Subscription ended");
      report.deleted += 1;
    });
  }

  // 4. Warn whoever is about to be charged. Last, because the steps above may
  // have moved a period forward, and the warning should be about the new one.
  const noticeCutoff = new Date(now.getTime() + BILLING_POLICY.renewalNoticeDays * DAY_MS);
  const upcoming = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: { gt: now, lte: noticeCutoff },
      server: liveServer,
    },
    select: { id: true, currentPeriodEnd: true, renewalNoticeFor: true },
  });

  for (const sub of upcoming) {
    // Comparing two columns is not expressible in the query above, so the
    // "already warned about this period" check happens here.
    if (sub.renewalNoticeFor?.getTime() === sub.currentPeriodEnd.getTime()) continue;
    await guarded(sub.id, async () => {
      await notifyRenewalUpcoming(sub.id);
      // Written after sending: a failure here means one extra email next run,
      // which is better than a silently skipped warning.
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { renewalNoticeFor: sub.currentPeriodEnd },
      });
      report.noticesSent += 1;
    });
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
