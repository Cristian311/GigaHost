import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { calculatePrice } from "@/lib/pricing/calculate-price";
import { previewResize, resizeServer } from "@/server/services/resize-service";
import { getActivePricing, toPricingTable } from "@/server/services/pricing-service";
import { createServerFor, createUser, resetData, setStatus } from "../setup/db";

/** Fresh server, subscription period starting exactly now. */
async function stoppedServer(
  overrides: Parameters<typeof createServerFor>[1] = {},
) {
  const user = await createUser();
  const { serverId } = await createServerFor(user.id, overrides);
  await setStatus(serverId, "STOPPED");
  return { user, serverId };
}

describe("resize with pro-rating", () => {
  beforeEach(resetData);

  it("previews an upgrade without writing anything", async () => {
    const { user, serverId } = await stoppedServer({ ramGb: 4, vcpu: 2, storageGb: 20 });

    const preview = await previewResize(serverId, user.id, {
      ramGb: 8,
      vcpu: 2,
      storageGb: 20,
    });

    // +4 GB RAM at 1.50 = +6.00 per month, region eu-ro multiplier 1.0
    expect(preview.newMonthlyCents - preview.oldMonthlyCents).toBe(600);
    expect(preview.changed).toBe(true);
    expect(preview.proration.chargeCents).toBeGreaterThan(0);

    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    expect(server.ramGb).toBe(4);
    expect(await prisma.order.count({ where: { kind: "RESIZE" } })).toBe(0);
  });

  it("charges the prorated difference and invoices an upgrade", async () => {
    const { user, serverId } = await stoppedServer({ ramGb: 4, vcpu: 2, storageGb: 20 });
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { serverId } });

    const { preview, orderId } = await resizeServer(
      serverId,
      user.id,
      { ramGb: 8, vcpu: 2, storageGb: 20 },
      sub.currentPeriodStart, // resize at the very start of the period
    );

    expect(preview.proration.remainingFraction).toBe(1);
    expect(preview.proration.chargeCents).toBe(600);

    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    expect(server.ramGb).toBe(8);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { invoices: true },
    });
    expect(order.kind).toBe("RESIZE");
    expect(order.status).toBe("PAID");
    expect(order.totalCents).toBe(600);
    expect(order.invoices).toHaveLength(1);
    expect(order.invoices[0].amountCents).toBe(600);
    expect(order.invoices[0].status).toBe("PAID");
  });

  it("charges only half when the period is half over", async () => {
    const { user, serverId } = await stoppedServer({ ramGb: 4, vcpu: 2, storageGb: 20 });
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { serverId } });
    const midpoint = new Date(
      (sub.currentPeriodStart.getTime() + sub.currentPeriodEnd.getTime()) / 2,
    );

    const { preview } = await resizeServer(
      serverId,
      user.id,
      { ramGb: 8, vcpu: 2, storageGb: 20 },
      midpoint,
    );

    expect(preview.proration.remainingFraction).toBeCloseTo(0.5, 3);
    expect(preview.proration.chargeCents).toBe(300);
  });

  it("records a credit and no invoice for a downgrade", async () => {
    const { user, serverId } = await stoppedServer({ ramGb: 8, vcpu: 4, storageGb: 50 });
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { serverId } });

    const { preview, orderId } = await resizeServer(
      serverId,
      user.id,
      { ramGb: 4, vcpu: 2, storageGb: 30 },
      sub.currentPeriodStart,
    );

    // -4 GB (6.00) -4... careful: -4 RAM = -6.00, -2 vCPU = -4.00, -20 GB = -2.00 => -12.00
    expect(preview.proration.deltaCents).toBe(-1200);
    expect(preview.proration.chargeCents).toBe(0);
    expect(preview.proration.creditCents).toBe(1200);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { invoices: true },
    });
    expect(order.totalCents).toBe(0);
    expect(order.invoices).toHaveLength(0);

    const updatedSub = await prisma.subscription.findUniqueOrThrow({ where: { serverId } });
    expect(updatedSub.creditCents).toBe(1200);
  });

  it("updates the recurring amount to the new configuration", async () => {
    const { user, serverId } = await stoppedServer({
      ramGb: 4,
      vcpu: 2,
      storageGb: 20,
      billingPeriod: "YEARLY",
      regionCode: "eu-de",
    });

    await resizeServer(serverId, user.id, { ramGb: 8, vcpu: 4, storageGb: 50 });

    const pricing = toPricingTable(await getActivePricing());
    const region = await prisma.region.findUniqueOrThrow({ where: { code: "eu-de" } });
    const expected = calculatePrice(
      {
        ramGb: 8,
        vcpu: 4,
        storageGb: 50,
        regionMultiplier: region.priceMultiplier,
        billingPeriod: "YEARLY",
      },
      pricing,
    );

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { serverId } });
    expect(sub.amountCents).toBe(expected.totalCents);
  });

  it("logs a RESIZED event with the old and new resources", async () => {
    const { user, serverId } = await stoppedServer({ ramGb: 4, vcpu: 2, storageGb: 20 });
    await resizeServer(serverId, user.id, { ramGb: 6, vcpu: 2, storageGb: 20 });

    const event = await prisma.serverEvent.findFirstOrThrow({
      where: { serverId, type: "RESIZED" },
    });
    const meta = JSON.parse(event.meta ?? "{}");
    expect(meta.from.ramGb).toBe(4);
    expect(meta.to.ramGb).toBe(6);
  });

  it("refuses a configuration below the game minimums", async () => {
    const { user, serverId } = await stoppedServer({
      gameSlug: "rust",
      ramGb: 8,
      vcpu: 3,
      storageGb: 40,
    });

    await expect(
      resizeServer(serverId, user.id, { ramGb: 2, vcpu: 1, storageGb: 10 }),
    ).rejects.toMatchObject({ code: "below_minimum" });
  });

  it("refuses to resize a server that is not in a stable state", async () => {
    const user = await createUser();
    const { serverId } = await createServerFor(user.id); // INSTALLING

    await expect(
      resizeServer(serverId, user.id, { ramGb: 16, vcpu: 4, storageGb: 50 }),
    ).rejects.toMatchObject({ code: "invalid_transition" });

    await setStatus(serverId, "SUSPENDED");
    await expect(
      resizeServer(serverId, user.id, { ramGb: 16, vcpu: 4, storageGb: 50 }),
    ).rejects.toMatchObject({ code: "invalid_transition" });
  });

  it("rejects a no-op resize", async () => {
    const { user, serverId } = await stoppedServer({ ramGb: 8, vcpu: 4, storageGb: 50 });
    await expect(
      resizeServer(serverId, user.id, { ramGb: 8, vcpu: 4, storageGb: 50 }),
    ).rejects.toMatchObject({ code: "no_change" });
  });

  it("does not let another user resize the server", async () => {
    const { serverId } = await stoppedServer();
    const stranger = await createUser();

    await expect(
      resizeServer(serverId, stranger.id, { ramGb: 16, vcpu: 4, storageGb: 50 }),
    ).rejects.toMatchObject({ code: "server_not_found" });
    await expect(
      previewResize(serverId, stranger.id, { ramGb: 16, vcpu: 4, storageGb: 50 }),
    ).rejects.toMatchObject({ code: "server_not_found" });
  });
});
