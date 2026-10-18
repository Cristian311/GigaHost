import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { AppError } from "@/server/errors";
import type { ChargeFn } from "@/server/payments";
import { claimInvoiceNumber, nextInvoiceNumber } from "@/server/services/invoice-service";
import { purgeExpiredJobLocks, withJobLock } from "@/server/services/job-lock";
import { createOrder, fulfilOrder } from "@/server/services/order-service";
import { runBillingCycle } from "@/server/services/renewal-service";
import { runDueTasks } from "@/server/services/task-service";
import { createServerFor, createUser, endPeriod, resetData } from "../setup/db";

const PRICE = 2700;

const approve = () =>
  vi.fn<ChargeFn>(async (request) => ({
    status: "succeeded",
    reference: `test_${request.idempotencyKey}`,
  }));

const newOrderInput = {
  name: "Concurrent server",
  gameSlug: "minecraft-paper",
  ramGb: 8,
  vcpu: 4,
  storageGb: 50,
  regionCode: "eu-ro",
  billingPeriod: "MONTHLY",
  waiveWithdrawal: true,
} as const;

/**
 * These cover the failures that only appear when two things happen at once: an
 * overlapping cron run, a webhook racing the success page, two checkouts
 * landing in the same millisecond. None of them show up in a sequential test,
 * and each one either charges a customer twice or leaves them with nothing.
 */
describe("concurrency", () => {
  beforeEach(async () => {
    await resetData();
    await prisma.jobLock.deleteMany();
    // Numbering restarts per test, so expectations can name exact numbers.
    await prisma.invoiceCounter.deleteMany();
  });

  describe("job locks", () => {
    it("lets only one holder in at a time", async () => {
      const order: string[] = [];
      let release: (() => void) | undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });

      const first = withJobLock("billing-cycle", async () => {
        order.push("first-start");
        await held;
        order.push("first-end");
        return "first";
      });

      // Give the first call time to take the lease before the second tries.
      await new Promise((resolve) => setTimeout(resolve, 50));
      const second = await withJobLock("billing-cycle", async () => {
        order.push("second-ran");
        return "second";
      });

      expect(second).toBeNull();
      release?.();
      expect(await first).toBe("first");
      expect(order).toEqual(["first-start", "first-end"]);
    });

    it("releases the lease even when the job throws", async () => {
      await expect(
        withJobLock("due-tasks", async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");

      expect(await withJobLock("due-tasks", async () => "free")).toBe("free");
    });

    it("lets the next run take over a lease whose holder died", async () => {
      // A crashed run leaves its row behind; the expiry is what unblocks it.
      await prisma.jobLock.create({
        data: {
          name: "billing-cycle",
          holder: "crashed-run",
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      expect(await withJobLock("billing-cycle", async () => "taken-over")).toBe("taken-over");
      expect(await prisma.jobLock.findUnique({ where: { name: "billing-cycle" } })).toBeNull();
    });

    it("does not let a timed-out run release the lease its successor now holds", async () => {
      const takenOver = withJobLock(
        "billing-cycle",
        async () => {
          // While this one runs, its lease expires and another run takes it.
          await prisma.jobLock.update({
            where: { name: "billing-cycle" },
            data: { holder: "someone-else", expiresAt: new Date(Date.now() + 60_000) },
          });
        },
        { ttlMs: 1 },
      );
      await takenOver;

      const lock = await prisma.jobLock.findUnique({ where: { name: "billing-cycle" } });
      expect(lock?.holder).toBe("someone-else");
    });

    it("purges leases nobody holds any more", async () => {
      await prisma.jobLock.create({
        data: { name: "due-tasks", holder: "old", expiresAt: new Date(Date.now() - 1000) },
      });
      expect(await purgeExpiredJobLocks()).toBe(1);
    });
  });

  describe("billing cycle", () => {
    it("does not bill twice when two runs overlap", async () => {
      const user = await createUser();
      const { serverId } = await createServerFor(user.id);
      await endPeriod(serverId);
      const charge = approve();

      const [a, b] = await Promise.all([
        runBillingCycle(new Date(), { charge }),
        runBillingCycle(new Date(), { charge }),
      ]);

      // One run did the work; the other found the lease taken and did nothing.
      const reports = [a, b];
      expect(reports.filter((r) => r.skipped === true)).toHaveLength(1);
      expect(reports.filter((r) => r.renewed === 1)).toHaveLength(1);

      // The part that actually costs money: one charge, one renewal order.
      expect(charge).toHaveBeenCalledTimes(1);
      const orders = await prisma.order.findMany({ where: { serverId, kind: "RENEWAL" } });
      expect(orders).toHaveLength(1);
      expect(orders[0].totalCents).toBe(PRICE);
    });

    it("still runs normally the next time round", async () => {
      const user = await createUser();
      const { serverId } = await createServerFor(user.id);
      await endPeriod(serverId);

      await Promise.all([runBillingCycle(new Date(), { charge: approve() })]);
      const again = await runBillingCycle(new Date(), { charge: approve() });
      expect(again.skipped).toBeUndefined();
    });

    it("keeps scheduled tasks to one run at a time too", async () => {
      const [a, b] = await Promise.all([runDueTasks(), runDueTasks()]);
      expect([a, b].filter((r) => r.lockedOut === true)).toHaveLength(1);
    });
  });

  describe("order fulfilment", () => {
    it("provisions one server when the webhook and the success page race", async () => {
      const user = await createUser();
      const order = await createOrder(user.id, newOrderInput);

      const results = await Promise.allSettled([fulfilOrder(order.id), fulfilOrder(order.id)]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");

      // Whichever lost the race either waited its turn or was told to retry;
      // what matters is that the customer ends up with exactly one of each.
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      expect(await prisma.server.count({ where: { ownerId: user.id } })).toBe(1);
      expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(1);
      expect(await prisma.subscription.count({ where: { orderId: order.id } })).toBe(1);

      const rejected = results.find((r) => r.status === "rejected");
      if (rejected) {
        expect((rejected.reason as AppError).code).toBe("order_in_progress");
      }
    });

    it("finishes an order whose first attempt died after taking the money", async () => {
      const user = await createUser();
      const order = await createOrder(user.id, newOrderInput);
      const { serverId } = await fulfilOrder(order.id);

      // Reproduce a crash between provisioning and the records that follow:
      // paid, server built, nothing else written.
      await prisma.invoice.deleteMany({ where: { orderId: order.id } });
      await prisma.subscription.deleteMany({ where: { orderId: order.id } });

      const resumed = await fulfilOrder(order.id);

      expect(resumed.serverId).toBe(serverId);
      // Resumed rather than started over: no second server.
      expect(await prisma.server.count({ where: { ownerId: user.id } })).toBe(1);
      expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(1);
      expect(await prisma.subscription.count({ where: { orderId: order.id } })).toBe(1);
    });

    it("rebuilds the server for an order that was paid but never provisioned", async () => {
      const user = await createUser();
      const order = await createOrder(user.id, newOrderInput);

      // Paid, then the process died before anything was created.
      await prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } });

      const { serverId } = await fulfilOrder(order.id);
      expect(serverId).toBeTruthy();
      expect(await prisma.subscription.count({ where: { orderId: order.id } })).toBe(1);
    });

    it("stays idempotent for an order that is already complete", async () => {
      const user = await createUser();
      const order = await createOrder(user.id, newOrderInput);
      const first = await fulfilOrder(order.id);
      const second = await fulfilOrder(order.id);

      expect(second).toEqual(first);
      expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(1);
    });
  });

  describe("invoice numbering", () => {
    /** Creates an invoice the way the services do, through a real order. */
    async function invoiceFor(number: string) {
      const user = await createUser();
      const order = await createOrder(user.id, newOrderInput);
      return prisma.invoice.create({
        data: {
          number,
          userId: user.id,
          orderId: order.id,
          status: "PAID",
          amountCents: 100,
          currency: "EUR",
          issuedAt: new Date(),
          dueAt: new Date(),
        },
      });
    }

    it("never hands the same number to two concurrent callers", async () => {
      const numbers = await Promise.all(Array.from({ length: 25 }, () => nextInvoiceNumber()));
      expect(new Set(numbers).size).toBe(25);
    });

    it("continues after the numbers already in the database", async () => {
      await invoiceFor("GH-2026-000041");
      // The counter is seeded from what is stored, so an existing database
      // keeps its sequence instead of restarting at one.
      expect(await nextInvoiceNumber()).toBe("GH-2026-000042");
    });

    it("numbers concurrent checkouts without a collision", async () => {
      const users = await Promise.all([createUser(), createUser(), createUser()]);
      const orders = await Promise.all(users.map((user) => createOrder(user.id, newOrderInput)));

      await Promise.all(orders.map((order) => fulfilOrder(order.id)));

      const numbers = (await prisma.invoice.findMany({ select: { number: true } })).map(
        (invoice) => invoice.number,
      );
      expect(numbers).toHaveLength(3);
      expect(new Set(numbers).size).toBe(3);
    });

    it("steps over a number that was inserted behind the counter's back", async () => {
      const next = await nextInvoiceNumber();
      await invoiceFor(next); // e.g. restored from a backup

      const user = await createUser();
      const order = await createOrder(user.id, newOrderInput);
      const created = await claimInvoiceNumber((number) =>
        prisma.invoice.create({
          data: {
            number,
            userId: user.id,
            orderId: order.id,
            status: "PAID",
            amountCents: 200,
            currency: "EUR",
            issuedAt: new Date(),
            dueAt: new Date(),
          },
        }),
      );

      expect(created.number).not.toBe(next);
    });

    it("surfaces an unrelated failure instead of retrying it", async () => {
      await expect(
        claimInvoiceNumber(async () => {
          throw new AppError("validation", 400, "not a duplicate");
        }),
      ).rejects.toMatchObject({ code: "validation" });
    });
  });
});
