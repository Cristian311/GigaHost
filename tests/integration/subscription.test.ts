import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  listInvoicesForUser,
  listOrdersForUser,
  listSubscriptionsForUser,
  setCancelAtPeriodEnd,
} from "@/server/services/order-service";
import { createServerFor, createUser, resetData } from "../setup/db";

describe("subscriptions and billing history", () => {
  beforeEach(resetData);

  it("schedules a cancellation and resumes it", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { serverId } });

    const cancelled = await setCancelAtPeriodEnd(sub.id, user.id, true);
    expect(cancelled?.cancelAtPeriodEnd).toBe(true);
    expect(cancelled?.status).toBe("ACTIVE"); // still running until the period ends

    const resumed = await setCancelAtPeriodEnd(sub.id, user.id, false);
    expect(resumed?.cancelAtPeriodEnd).toBe(false);
  });

  it("does not let another user touch the subscription", async () => {
    const user = await createUser();
    const stranger = await createUser();
    const { serverId } = await createServerFor(user.id);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { serverId } });

    expect(await setCancelAtPeriodEnd(sub.id, stranger.id, true)).toBeNull();

    const unchanged = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(unchanged.cancelAtPeriodEnd).toBe(false);
  });

  it("lists only the caller's billing history", async () => {
    const user = await createUser();
    const stranger = await createUser();
    await createServerFor(user.id, { name: "Mine" });
    await createServerFor(stranger.id, { name: "Theirs" });

    const [subs, invoices, orders] = await Promise.all([
      listSubscriptionsForUser(user.id),
      listInvoicesForUser(user.id),
      listOrdersForUser(user.id),
    ]);

    expect(subs).toHaveLength(1);
    expect(subs[0].server.name).toBe("Mine");
    expect(invoices).toHaveLength(1);
    expect(orders).toHaveLength(1);
    expect(orders[0].server?.name).toBe("Mine");
  });

  it("returns null for an unknown subscription", async () => {
    const user = await createUser();
    expect(await setCancelAtPeriodEnd("nope", user.id, true)).toBeNull();
  });
});
