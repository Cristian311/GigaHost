import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  deleteCoupon,
  listCoupons,
  upsertCoupon,
  validateCoupon,
} from "@/server/services/coupon-service";
import { createCoupon, createServerFor, createUser, resetData } from "../setup/db";

// Default test server: 8 GB RAM, 4 vCPU, 50 GB in eu-ro, monthly = 27.00 EUR.
const PRICE = 2700;

describe("coupons", () => {
  beforeEach(resetData);

  it("takes a percentage off the first order only", async () => {
    const user = await createUser();
    const coupon = await createCoupon({ code: "WELCOME20", kind: "PERCENT", value: 20 });

    const { orderId, serverId } = await createServerFor(user.id, { couponCode: "welcome20" });

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.couponId).toBe(coupon.id);
    expect(order.couponDiscountCents).toBe(540);
    expect(order.totalCents).toBe(PRICE - 540);

    const invoice = await prisma.invoice.findFirstOrThrow({ where: { orderId } });
    expect(invoice.amountCents).toBe(PRICE - 540);

    // The subscription renews at the regular price.
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { serverId } });
    expect(sub.amountCents).toBe(PRICE);
  });

  it("takes a fixed amount off", async () => {
    const user = await createUser();
    await createCoupon({ code: "FIVER", kind: "FIXED", value: 500 });

    const { orderId } = await createServerFor(user.id, { couponCode: "FIVER" });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.totalCents).toBe(PRICE - 500);
  });

  it("records the redemption and counts it", async () => {
    const user = await createUser();
    const coupon = await createCoupon();

    const { orderId } = await createServerFor(user.id, { couponCode: coupon.code });

    const redemption = await prisma.couponRedemption.findUniqueOrThrow({ where: { orderId } });
    expect(redemption.userId).toBe(user.id);
    expect(redemption.amountCents).toBe(540);

    const after = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
    expect(after.timesRedeemed).toBe(1);
  });

  it("fulfils a fully discounted order without charging", async () => {
    const user = await createUser();
    await createCoupon({ code: "FREE", kind: "PERCENT", value: 100 });

    const { orderId, serverId } = await createServerFor(user.id, { couponCode: "FREE" });

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.totalCents).toBe(0);
    expect(order.status).toBe("PAID");
    expect(serverId).toBeTruthy();
  });

  it("enforces the per-user limit", async () => {
    const user = await createUser();
    await createCoupon({ code: "ONCE", perUserLimit: 1 });

    await createServerFor(user.id, { couponCode: "ONCE" });
    await expect(createServerFor(user.id, { couponCode: "ONCE" })).rejects.toMatchObject({
      code: "coupon_already_used",
    });

    // Somebody else can still use it.
    const other = await createUser();
    await expect(createServerFor(other.id, { couponCode: "ONCE" })).resolves.toBeTruthy();
  });

  it("enforces the global redemption limit", async () => {
    const [a, b] = await Promise.all([createUser(), createUser()]);
    await createCoupon({ code: "FIRST", maxRedemptions: 1 });

    await createServerFor(a.id, { couponCode: "FIRST" });
    await expect(createServerFor(b.id, { couponCode: "FIRST" })).rejects.toMatchObject({
      code: "coupon_exhausted",
    });
  });

  it("rejects unknown, inactive and expired codes", async () => {
    const user = await createUser();
    await createCoupon({ code: "OFF", active: false });
    await createCoupon({ code: "OLD", expiresAt: new Date(Date.now() - 1000) });

    await expect(validateCoupon("NOPE", PRICE, user.id)).rejects.toMatchObject({
      code: "coupon_not_found",
    });
    await expect(validateCoupon("OFF", PRICE, user.id)).rejects.toMatchObject({
      code: "coupon_not_found",
    });
    await expect(validateCoupon("OLD", PRICE, user.id)).rejects.toMatchObject({
      code: "coupon_expired",
    });
  });

  it("requires the minimum order value", async () => {
    await createCoupon({ code: "BIG", minOrderCents: 5000 });
    await expect(validateCoupon("BIG", PRICE)).rejects.toMatchObject({
      code: "coupon_min_order",
    });
    await expect(validateCoupon("BIG", 5000)).resolves.toMatchObject({ discountCents: 1000 });
  });

  it("does not create an order when the coupon is refused", async () => {
    const user = await createUser();
    await expect(createServerFor(user.id, { couponCode: "NOPE" })).rejects.toMatchObject({
      code: "coupon_not_found",
    });
    expect(await prisma.order.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.server.count({ where: { ownerId: user.id } })).toBe(0);
  });

  describe("admin", () => {
    const base = {
      kind: "PERCENT" as const,
      value: 10,
      maxRedemptions: null,
      perUserLimit: 1,
      minOrderCents: 0,
      expiresAt: null,
      active: true,
    };

    it("creates, normalises and updates coupons", async () => {
      const created = await upsertCoupon({ ...base, code: "summer10" });
      expect(created.code).toBe("SUMMER10");

      const updated = await upsertCoupon({ ...base, id: created.id, code: "SUMMER10", value: 15 });
      expect(updated.value).toBe(15);
      expect(await listCoupons()).toHaveLength(1);
    });

    it("refuses a duplicate code", async () => {
      await upsertCoupon({ ...base, code: "DUP" });
      await expect(upsertCoupon({ ...base, code: "dup" })).rejects.toMatchObject({
        code: "coupon_code_taken",
      });
    });

    it("deletes unused coupons but only deactivates used ones", async () => {
      const user = await createUser();
      const unused = await createCoupon({ code: "UNUSED" });
      const used = await createCoupon({ code: "USED" });
      await createServerFor(user.id, { couponCode: "USED" });

      await deleteCoupon(unused.id);
      await deleteCoupon(used.id);

      expect(await prisma.coupon.findUnique({ where: { id: unused.id } })).toBeNull();
      const kept = await prisma.coupon.findUniqueOrThrow({ where: { id: used.id } });
      expect(kept.active).toBe(false);
    });
  });
});
