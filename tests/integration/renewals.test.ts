import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addMonths } from "@/lib/dates";
import type { ChargeFn } from "@/server/payments";
import { suspendServer } from "@/server/services/admin-service";
import { listEvents } from "@/server/services/event-service";
import { setCancelAtPeriodEnd } from "@/server/services/order-service";
import {
  BILLING_POLICY,
  payOutstanding,
  runBillingCycle,
} from "@/server/services/renewal-service";
import { deleteServer } from "@/server/services/server-service";
import {
  createServerFor,
  createUser,
  daysFromNow,
  endPeriod,
  resetData,
} from "../setup/db";

// Default test server: 8 GB RAM, 4 vCPU, 50 GB in eu-ro, monthly = 27.00 EUR.
const PRICE = 2700;

const approve = () =>
  vi.fn<ChargeFn>(async (request) => ({
    status: "succeeded",
    reference: `test_${request.idempotencyKey}`,
  }));
const decline = () =>
  vi.fn<ChargeFn>(async () => ({ status: "failed", reason: "card_declined" }));

async function dueServer(daysAgo = 0) {
  const user = await createUser();
  const { serverId } = await createServerFor(user.id);
  const sub = await endPeriod(serverId, daysAgo);
  return { user, serverId, sub };
}

const getSub = (serverId: string) =>
  prisma.subscription.findUniqueOrThrow({ where: { serverId } });
const getServer = (id: string) => prisma.server.findUniqueOrThrow({ where: { id } });
const renewalOrders = (serverId: string) =>
  prisma.order.findMany({
    where: { serverId, kind: "RENEWAL" },
    include: { invoices: true },
    orderBy: { createdAt: "asc" },
  });

describe("billing cycle", () => {
  beforeEach(resetData);

  describe("renewal", () => {
    it("bills a due subscription and moves the period forward", async () => {
      const { serverId, sub } = await dueServer();
      const charge = approve();

      const report = await runBillingCycle(new Date(), { charge });
      expect(report).toMatchObject({ renewed: 1, failed: 0 });

      expect(charge).toHaveBeenCalledOnce();
      expect(charge.mock.calls[0][0]).toMatchObject({ amountCents: PRICE, currency: "EUR" });

      const [order] = await renewalOrders(serverId);
      expect(order.status).toBe("PAID");
      expect(order.totalCents).toBe(PRICE);
      expect(order.invoices).toHaveLength(1);
      expect(order.invoices[0]).toMatchObject({ status: "PAID", amountCents: PRICE });
      expect(order.invoices[0].paidAt).not.toBeNull();

      const renewed = await getSub(serverId);
      expect(renewed.status).toBe("ACTIVE");
      expect(renewed.currentPeriodStart).toEqual(sub.currentPeriodEnd);
      expect(renewed.currentPeriodEnd).toEqual(addMonths(sub.currentPeriodEnd, 1));

      const events = await listEvents(serverId);
      expect(events[0].type).toBe("RENEWED");
    });

    it("leaves subscriptions alone until their period ends", async () => {
      const user = await createUser();
      const { serverId } = await createServerFor(user.id);
      const charge = approve();

      const report = await runBillingCycle(daysFromNow(10), { charge });

      expect(report.renewed).toBe(0);
      expect(charge).not.toHaveBeenCalled();
      expect(await renewalOrders(serverId)).toHaveLength(0);
    });

    it("bills every period the scheduler missed", async () => {
      const { serverId } = await dueServer(65);
      const charge = approve();

      const report = await runBillingCycle(new Date(), { charge });

      expect(report.renewed).toBe(3);
      expect(await renewalOrders(serverId)).toHaveLength(3);
      expect((await getSub(serverId)).currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());
    });

    it("is safe to run twice in a row", async () => {
      const { serverId } = await dueServer();
      const charge = approve();

      await runBillingCycle(new Date(), { charge });
      await runBillingCycle(new Date(), { charge });

      expect(charge).toHaveBeenCalledOnce();
      expect(await renewalOrders(serverId)).toHaveLength(1);
    });

    it("ignores deleted servers", async () => {
      const { user, serverId } = await dueServer();
      await deleteServer(serverId, user.id);
      const charge = approve();

      const report = await runBillingCycle(new Date(), { charge });

      expect(report.renewed).toBe(0);
      expect(charge).not.toHaveBeenCalled();
    });
  });

  describe("downgrade credit", () => {
    it("is deducted from the renewal", async () => {
      const { serverId } = await dueServer();
      await prisma.subscription.update({ where: { serverId }, data: { creditCents: 600 } });
      const charge = approve();

      await runBillingCycle(new Date(), { charge });

      expect(charge.mock.calls[0][0].amountCents).toBe(PRICE - 600);
      const [order] = await renewalOrders(serverId);
      expect(order).toMatchObject({
        subtotalCents: PRICE,
        creditAppliedCents: 600,
        totalCents: PRICE - 600,
      });
      expect((await getSub(serverId)).creditCents).toBe(0);
    });

    it("covers a whole period without touching the card and carries the rest over", async () => {
      const { serverId } = await dueServer();
      await prisma.subscription.update({ where: { serverId }, data: { creditCents: 4000 } });
      const charge = approve();

      const report = await runBillingCycle(new Date(), { charge });

      expect(report.renewed).toBe(1);
      expect(charge).not.toHaveBeenCalled();
      const [order] = await renewalOrders(serverId);
      expect(order).toMatchObject({ status: "PAID", totalCents: 0, creditAppliedCents: PRICE });
      expect((await getSub(serverId)).creditCents).toBe(4000 - PRICE);
    });
  });

  describe("cancellation", () => {
    it("ends the subscription instead of renewing it", async () => {
      const { user, serverId, sub } = await dueServer();
      await setCancelAtPeriodEnd(sub.id, user.id, true);
      const charge = approve();

      const report = await runBillingCycle(new Date(), { charge });

      expect(report).toMatchObject({ cancelled: 1, renewed: 0 });
      expect(charge).not.toHaveBeenCalled();
      expect((await getSub(serverId)).status).toBe("CANCELLED");
      expect(await getServer(serverId)).toMatchObject({
        status: "SUSPENDED",
        suspensionReason: "BILLING",
      });
    });

    it("deletes the server once the retention window is over", async () => {
      const { user, serverId, sub } = await dueServer();
      await setCancelAtPeriodEnd(sub.id, user.id, true);
      await runBillingCycle(new Date(), { charge: approve() });

      const early = await runBillingCycle(daysFromNow(BILLING_POLICY.deleteAfterDays - 1));
      expect(early.deleted).toBe(0);
      expect((await getServer(serverId)).status).toBe("SUSPENDED");

      const late = await runBillingCycle(daysFromNow(BILLING_POLICY.deleteAfterDays + 1));
      expect(late.deleted).toBe(1);
      expect((await getServer(serverId)).status).toBe("DELETED");
      expect((await getSub(serverId)).status).toBe("CANCELLED");
    });
  });

  describe("failed payments", () => {
    it("marks the subscription past due and keeps the server online at first", async () => {
      const { serverId, sub } = await dueServer();

      const report = await runBillingCycle(new Date(), { charge: decline() });
      expect(report).toMatchObject({ renewed: 0, failed: 1, suspended: 0 });

      const after = await getSub(serverId);
      expect(after.status).toBe("PAST_DUE");
      expect(after.pastDueSince).not.toBeNull();
      expect(after.chargeAttempts).toBe(1);
      // The period does not move until the money arrives.
      expect(after.currentPeriodEnd).toEqual(sub.currentPeriodEnd);

      const [order] = await renewalOrders(serverId);
      expect(order.status).toBe("PENDING");
      expect(order.invoices[0]).toMatchObject({ status: "OPEN", amountCents: PRICE });

      expect((await getServer(serverId)).status).not.toBe("SUSPENDED");
      const events = await listEvents(serverId);
      expect(events[0]).toMatchObject({ type: "PAYMENT_FAILED", message: "card_declined" });
    });

    it("waits a day between retries and uses a fresh idempotency key each time", async () => {
      const { serverId } = await dueServer();
      const charge = decline();
      const start = new Date();

      await runBillingCycle(start, { charge });
      await runBillingCycle(new Date(start.getTime() + 3_600_000), { charge });
      expect(charge).toHaveBeenCalledTimes(1);

      await runBillingCycle(new Date(start.getTime() + 25 * 3_600_000), { charge });
      expect(charge).toHaveBeenCalledTimes(2);

      const keys = charge.mock.calls.map(([request]) => request.idempotencyKey);
      expect(new Set(keys).size).toBe(2);

      // Still a single invoice for the period, however many attempts it took.
      const orders = await renewalOrders(serverId);
      expect(orders).toHaveLength(1);
      expect(orders[0].invoices).toHaveLength(1);
      expect((await getSub(serverId)).chargeAttempts).toBe(2);
    });

    it("suspends the server after the grace period", async () => {
      const { serverId } = await dueServer();
      const charge = decline();
      await runBillingCycle(new Date(), { charge });

      const report = await runBillingCycle(daysFromNow(BILLING_POLICY.suspendAfterDays), {
        charge,
      });

      expect(report.suspended).toBe(1);
      expect(await getServer(serverId)).toMatchObject({
        status: "SUSPENDED",
        suspensionReason: "BILLING",
      });
    });

    it("deletes the server and voids the invoice when it stays unpaid", async () => {
      const { serverId } = await dueServer();
      const charge = decline();
      await runBillingCycle(new Date(), { charge });

      const report = await runBillingCycle(daysFromNow(BILLING_POLICY.deleteAfterDays), {
        charge,
      });

      expect(report.deleted).toBe(1);
      expect((await getServer(serverId)).status).toBe("DELETED");
      expect((await getSub(serverId)).status).toBe("EXPIRED");

      const [order] = await renewalOrders(serverId);
      expect(order.status).toBe("CANCELLED");
      expect(order.invoices[0].status).toBe("VOID");
    });

    it("recovers when a retry goes through and lifts the suspension", async () => {
      const { serverId, sub } = await dueServer();
      await runBillingCycle(new Date(), { charge: decline() });
      await runBillingCycle(daysFromNow(4), { charge: decline() });
      expect((await getServer(serverId)).status).toBe("SUSPENDED");

      const report = await runBillingCycle(daysFromNow(6), { charge: approve() });
      expect(report.renewed).toBe(1);

      const recovered = await getSub(serverId);
      expect(recovered).toMatchObject({
        status: "ACTIVE",
        pastDueSince: null,
        chargeAttempts: 0,
      });
      // The period keeps its original anchor even though the payment came late.
      expect(recovered.currentPeriodStart).toEqual(sub.currentPeriodEnd);

      expect(await getServer(serverId)).toMatchObject({
        status: "STOPPED",
        suspensionReason: null,
      });

      const [order] = await renewalOrders(serverId);
      expect(order.status).toBe("PAID");
      expect(order.invoices[0].status).toBe("PAID");
      expect((await listEvents(serverId)).map((e) => e.type)).toContain("UNSUSPENDED");
    });

    it("does not lift a suspension an admin put in place", async () => {
      const { serverId } = await dueServer();
      await runBillingCycle(new Date(), { charge: decline() });
      await suspendServer(serverId, "Abuse report");

      await runBillingCycle(daysFromNow(2), { charge: approve() });

      expect((await getSub(serverId)).status).toBe("ACTIVE");
      expect(await getServer(serverId)).toMatchObject({
        status: "SUSPENDED",
        suspensionReason: "ADMIN",
      });
    });

    it("voids the unpaid invoice when the customer deletes the server", async () => {
      const { user, serverId } = await dueServer();
      await runBillingCycle(new Date(), { charge: decline() });

      await deleteServer(serverId, user.id);

      const [order] = await renewalOrders(serverId);
      expect(order.status).toBe("CANCELLED");
      expect(order.invoices[0].status).toBe("VOID");
      expect((await getSub(serverId)).status).toBe("CANCELLED");
    });
  });

  describe("pay now", () => {
    it("settles the outstanding invoice immediately", async () => {
      const { user, serverId, sub } = await dueServer();
      await runBillingCycle(new Date(), { charge: decline() });

      // No waiting for the daily retry: the customer asked for it.
      const paid = await payOutstanding(sub.id, user.id, { charge: approve() });

      expect(paid.status).toBe("ACTIVE");
      const [order] = await renewalOrders(serverId);
      expect(order.invoices[0].status).toBe("PAID");
    });

    it("reports a declined card and stays past due", async () => {
      const { user, serverId, sub } = await dueServer();
      await runBillingCycle(new Date(), { charge: decline() });

      await expect(payOutstanding(sub.id, user.id, { charge: decline() })).rejects.toMatchObject({
        code: "payment_failed",
        status: 402,
      });
      expect((await getSub(serverId)).status).toBe("PAST_DUE");
    });

    it("refuses when nothing is owed", async () => {
      const user = await createUser();
      const { serverId } = await createServerFor(user.id);
      const sub = await getSub(serverId);

      await expect(payOutstanding(sub.id, user.id)).rejects.toMatchObject({
        code: "nothing_due",
      });
    });

    it("does not let someone else pay into another account's subscription", async () => {
      const { sub } = await dueServer();
      const stranger = await createUser();
      await runBillingCycle(new Date(), { charge: decline() });

      await expect(payOutstanding(sub.id, stranger.id)).rejects.toMatchObject({
        code: "subscription_not_found",
      });
    });
  });

  it("uses the configured gateway when no charge function is injected", async () => {
    const { serverId } = await dueServer();
    // The mock gateway approves everything.
    const report = await runBillingCycle();
    expect(report.renewed).toBe(1);
    expect((await getSub(serverId)).status).toBe("ACTIVE");
  });
});
