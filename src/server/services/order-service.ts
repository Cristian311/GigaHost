import { prisma } from "@/lib/db";
import { addMonths } from "@/lib/dates";
import { MONTHS_PER_PERIOD, type PriceBreakdown } from "@/lib/pricing/types";
import type { CreateServerInput } from "@/lib/validation/server";
import { AppError } from "@/server/errors";
import { getPaymentProvider } from "@/server/payments";
import { redeemCoupon, validateCoupon } from "./coupon-service";
import { claimInvoiceNumber, nextInvoiceNumber } from "./invoice-service";
import { withJobLock } from "./job-lock";
import { notifyOrderConfirmed } from "./notification-service";
import { quote } from "./pricing-service";
import { createServerRecord, provisionServer, type ServerSpec } from "./server-service";

/** Everything needed to provision the server once the order is paid. */
export type OrderSnapshot = {
  name: string;
  gameSlug: string;
  gameName: string;
  gameVersion: string | null;
  regionCode: string;
  regionName: string;
  ramGb: number;
  vcpu: number;
  storageGb: number;
  breakdown: PriceBreakdown;
  couponCode?: string;
};

export type FulfilledOrder = { orderId: string; serverId: string };
export type CheckoutOutcome = FulfilledOrder | { orderId: string; redirectUrl: string };

export { nextInvoiceNumber };

/**
 * Recomputes the price server-side (the client total is never trusted),
 * validates the coupon and stores a PENDING order. The server itself is only
 * created once the order is paid (see `fulfilOrder`).
 */
export async function createOrder(userId: string, input: CreateServerInput) {
  const { breakdown, game, region } = await quote(input);

  const applied = input.couponCode
    ? await validateCoupon(input.couponCode, breakdown.totalCents, userId)
    : null;
  const couponDiscountCents = applied?.discountCents ?? 0;

  const snapshot: OrderSnapshot = {
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
    ...(applied ? { couponCode: applied.coupon.code } : {}),
  };

  return prisma.order.create({
    data: {
      userId,
      status: "PENDING",
      // Stamped at the moment of the order, which is when the customer made
      // the request; the schema above will not let it through otherwise.
      withdrawalWaivedAt: new Date(),
      billingPeriod: input.billingPeriod,
      configSnapshot: JSON.stringify(snapshot),
      subtotalCents: breakdown.subtotalCents,
      discountCents: breakdown.discountCents,
      couponDiscountCents,
      totalCents: breakdown.totalCents - couponDiscountCents,
      currency: breakdown.currency,
      couponId: applied?.coupon.id ?? null,
    },
  });
}

/** Provisioning is quick; this only has to outlive one fulfilment attempt. */
const FULFILMENT_LOCK_TTL_MS = 5 * 60_000;

/**
 * Turns a paid order into a server, an invoice and a subscription. Safe to call
 * more than once for the same order (gateways redeliver webhooks, and the
 * success page checks for itself when the webhook is late).
 *
 * The lease serialises those callers, so the resumption below cannot run twice
 * at once and provision two servers for one order.
 */
export async function fulfilOrder(
  orderId: string,
  paidAt: Date = new Date(),
): Promise<FulfilledOrder> {
  const result = await withJobLock(`order:${orderId}`, () => fulfilOrderPass(orderId, paidAt), {
    ttlMs: FULFILMENT_LOCK_TTL_MS,
  });
  if (result) return result;
  // Someone else is part-way through this very order. Retryable on purpose:
  // the caller should ask again rather than treat it as a dead order.
  throw new AppError("order_in_progress", 409, "This order is already being fulfilled.");
}

async function fulfilOrderPass(orderId: string, paidAt: Date): Promise<FulfilledOrder> {
  const claimed = await prisma.order.updateMany({
    where: { id: orderId, status: "PENDING", kind: "NEW" },
    data: { status: "PAID" },
  });

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.kind !== "NEW") throw new AppError("order_not_found", 404);

  if (claimed.count === 0) {
    if (order.status !== "PAID") {
      throw new AppError("order_not_found", 409, `Order is ${order.status}.`);
    }
    // Paid and finished: hand back the same answer as the first call.
    const subscription = await prisma.subscription.findFirst({
      where: { orderId: order.id },
      select: { id: true },
    });
    if (subscription && order.serverId) {
      return { orderId: order.id, serverId: order.serverId };
    }
    // Paid but unfinished — a crash between the steps below. Rather than
    // reporting a dead order to a customer who has been charged, pick the work
    // up where it stopped. Every step from here is written to be repeatable.
  }

  const snapshot = JSON.parse(order.configSnapshot) as OrderSnapshot;

  let server = order.serverId
    ? await prisma.server.findUnique({ where: { id: order.serverId } })
    : null;

  if (!server) {
    const [game, region] = await Promise.all([
      prisma.game.findUnique({ where: { slug: snapshot.gameSlug } }),
      prisma.region.findUnique({ where: { code: snapshot.regionCode } }),
    ]);
    if (!game) throw new AppError("game_not_found", 404);
    if (!region) throw new AppError("region_not_found", 404);

    const spec: ServerSpec = {
      userId: order.userId,
      name: snapshot.name,
      gameVersion: snapshot.gameVersion,
      ramGb: snapshot.ramGb,
      vcpu: snapshot.vcpu,
      storageGb: snapshot.storageGb,
      game,
      region,
    };
    const record = await createServerRecord(spec);
    // Linked before provisioning, not after: a crash in between would
    // otherwise leave a server nothing points at, and the resumption above
    // would build a second one.
    await prisma.order.update({ where: { id: order.id }, data: { serverId: record.id } });
    server = await provisionServer(record, spec);
  }

  const serverId = server.id;
  const months = MONTHS_PER_PERIOD[order.billingPeriod];

  // Each of these is skipped if a previous attempt already wrote it.
  const [existingInvoice, existingSubscription] = await Promise.all([
    prisma.invoice.findFirst({ where: { orderId: order.id }, select: { id: true } }),
    prisma.subscription.findFirst({ where: { orderId: order.id }, select: { id: true } }),
  ]);

  await claimInvoiceNumber((invoiceNumber) =>
    prisma.$transaction(async (tx) => {
      if (!existingInvoice) {
        await tx.invoice.create({
          data: {
            number: invoiceNumber,
            userId: order.userId,
            orderId: order.id,
            status: "PAID",
            amountCents: order.totalCents,
            currency: order.currency,
            issuedAt: paidAt,
            dueAt: paidAt,
            paidAt,
          },
        });
      }
      if (!existingSubscription) {
        await tx.subscription.create({
          data: {
            userId: order.userId,
            serverId,
            orderId: order.id,
            status: "ACTIVE",
            billingPeriod: order.billingPeriod,
            // Renewals are billed at the regular price: a coupon only ever
            // discounts the first invoice.
            amountCents: snapshot.breakdown.totalCents,
            currency: order.currency,
            currentPeriodStart: paidAt,
            currentPeriodEnd: addMonths(paidAt, months),
          },
        });
        // Inside the same guard as the subscription, so a resumed run cannot
        // redeem the coupon a second time.
        if (order.couponId) {
          await redeemCoupon(tx, {
            couponId: order.couponId,
            userId: order.userId,
            orderId: order.id,
            amountCents: order.couponDiscountCents,
          });
        }
      }
    }),
  );

  await notifyOrderConfirmed(order.id);
  return { orderId: order.id, serverId };
}

/**
 * Customer-facing checkout. With the mock gateway (or a total of zero) the
 * order is fulfilled on the spot; a hosted gateway returns a URL to redirect
 * to, and its webhook calls `fulfilOrder` once the payment went through.
 */
export async function checkout(
  userId: string,
  input: CreateServerInput,
  urls: { successUrl: string; cancelUrl: string },
): Promise<CheckoutOutcome> {
  const order = await createOrder(userId, input);
  if (order.totalCents === 0) return fulfilOrder(order.id);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const provider = getPaymentProvider();
  // The success page needs to know which order to wait for.
  const successUrl = new URL(urls.successUrl);
  successUrl.searchParams.set("order", order.id);

  let result;
  try {
    result = await provider.startCheckout({
      orderId: order.id,
      userId,
      userEmail: user.email,
      amountCents: order.totalCents,
      currency: order.currency,
      description: `${input.name} (${input.ramGb} GB RAM, ${input.vcpu} vCPU, ${input.storageGb} GB)`,
      successUrl: successUrl.toString(),
      cancelUrl: urls.cancelUrl,
    });
  } catch (error) {
    // Do not leave an order behind that nobody can ever pay.
    await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    throw error;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { paymentProvider: provider.name, paymentReference: result.reference },
  });

  if (result.kind === "paid") return fulfilOrder(order.id);
  return { orderId: order.id, redirectUrl: result.url };
}

/** Creates and immediately fulfils an order, bypassing the gateway. */
export async function checkoutMock(
  userId: string,
  input: CreateServerInput,
): Promise<FulfilledOrder> {
  const order = await createOrder(userId, input);
  return fulfilOrder(order.id);
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
