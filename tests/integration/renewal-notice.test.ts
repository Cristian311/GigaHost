import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { BILLING_POLICY } from "@/lib/constants";
import type { ChargeFn } from "@/server/payments";
import { runBillingCycle } from "@/server/services/renewal-service";
import { addMessage, createTicket } from "@/server/services/ticket-service";
import { createServerFor, createUser, outbox, resetData } from "../setup/db";

const DAY_MS = 86_400_000;

const approve = () =>
  vi.fn<ChargeFn>(async (request) => ({
    status: "succeeded",
    reference: `test_${request.idempotencyKey}`,
  }));

/** Moves a subscription's period end to `days` from now. */
async function periodEndsIn(serverId: string, days: number) {
  const end = new Date(Date.now() + days * DAY_MS);
  return prisma.subscription.update({
    where: { serverId },
    data: { currentPeriodStart: new Date(end.getTime() - 30 * DAY_MS), currentPeriodEnd: end },
  });
}

describe("customer notices", () => {
  beforeEach(resetData);

  describe("renewal reminder", () => {
    it("warns before the card is charged", async () => {
      const user = await createUser();
      const { serverId } = await createServerFor(user.id);
      await periodEndsIn(serverId, BILLING_POLICY.renewalNoticeDays - 1);

      const report = await runBillingCycle(new Date(), { charge: approve() });

      expect(report.noticesSent).toBe(1);
      const sent = await outbox(user.email);
      expect(sent.map((email) => email.template)).toContain("renewalUpcoming");
    });

    it("says how much and when", async () => {
      const user = await createUser();
      const { serverId } = await createServerFor(user.id);
      await periodEndsIn(serverId, 2);

      await runBillingCycle(new Date(), { charge: approve() });

      const notice = (await outbox(user.email)).find(
        (email) => email.template === "renewalUpcoming",
      );
      // The two facts that make it a warning rather than an advert.
      expect(notice?.text).toMatch(/27[.,]00/);
      expect(notice?.text.toLowerCase()).toContain("cancel");
    });

    it("sends one per period, however often the scheduler runs", async () => {
      const user = await createUser();
      const { serverId } = await createServerFor(user.id);
      await periodEndsIn(serverId, 3);

      for (let run = 0; run < 3; run += 1) {
        await runBillingCycle(new Date(), { charge: approve() });
      }

      const notices = (await outbox(user.email)).filter(
        (email) => email.template === "renewalUpcoming",
      );
      expect(notices).toHaveLength(1);
    });

    it("stays quiet while the renewal is still far off", async () => {
      const user = await createUser();
      const { serverId } = await createServerFor(user.id);
      await periodEndsIn(serverId, BILLING_POLICY.renewalNoticeDays + 5);

      const report = await runBillingCycle(new Date(), { charge: approve() });
      expect(report.noticesSent).toBe(0);
    });

    it("does not warn about a subscription that was cancelled", async () => {
      const user = await createUser();
      const { serverId } = await createServerFor(user.id);
      await periodEndsIn(serverId, 2);
      await prisma.subscription.update({
        where: { serverId },
        data: { cancelAtPeriodEnd: true },
      });

      const report = await runBillingCycle(new Date(), { charge: approve() });
      // Nothing will be charged, so there is nothing to warn about.
      expect(report.noticesSent).toBe(0);
    });

    it("warns again for the following period", async () => {
      const user = await createUser();
      const { serverId } = await createServerFor(user.id);
      await periodEndsIn(serverId, 2);
      await runBillingCycle(new Date(), { charge: approve() });

      // The period rolls over; the next one deserves its own warning.
      await periodEndsIn(serverId, 32);
      await periodEndsIn(serverId, 2);
      await runBillingCycle(new Date(), { charge: approve() });

      const notices = (await outbox(user.email)).filter(
        (email) => email.template === "renewalUpcoming",
      );
      expect(notices.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("ticket replies", () => {
    const ticketFor = (userId: string) =>
      createTicket(userId, {
        subject: "Server will not start",
        body: "It keeps crashing",
        category: "TECHNICAL",
        priority: "NORMAL",
        serverId: null,
      });

    it("emails the customer when support answers", async () => {
      const user = await createUser();
      const admin = await createUser({ role: "ADMIN" });
      const ticket = await ticketFor(user.id);

      await addMessage(
        ticket.id,
        { id: admin.id, role: "ADMIN" },
        { body: "Try restarting it", isInternal: false },
      );

      const sent = await outbox(user.email);
      const reply = sent.find((email) => email.template === "ticketReplied");
      expect(reply).toBeDefined();
      expect(reply?.text).toContain("Server will not start");
    });

    it("says nothing about a staff-only note", async () => {
      const user = await createUser();
      const admin = await createUser({ role: "ADMIN" });
      const ticket = await ticketFor(user.id);

      await addMessage(
        ticket.id,
        { id: admin.id, role: "ADMIN" },
        { body: "Internal: node 3 is flaky", isInternal: true },
      );

      const sent = await outbox(user.email);
      expect(sent.some((email) => email.template === "ticketReplied")).toBe(false);
    });

    it("does not email the customer about their own message", async () => {
      const user = await createUser();
      const ticket = await ticketFor(user.id);

      await addMessage(
        ticket.id,
        { id: user.id, role: "USER" },
        { body: "Any update?", isInternal: false },
      );

      const sent = await outbox(user.email);
      expect(sent.some((email) => email.template === "ticketReplied")).toBe(false);
    });
  });
});
