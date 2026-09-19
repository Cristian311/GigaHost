import type { z } from "zod";
import { prisma } from "@/lib/db";
import type { Coupon, Prisma } from "@/generated/prisma/client";
import { couponDiscount, normalizeCouponCode } from "@/lib/pricing/coupon";
import type { upsertCouponSchema } from "@/lib/validation/admin";
import { AppError } from "@/server/errors";

export type AppliedCoupon = {
  coupon: Coupon;
  discountCents: number;
};

/**
 * Checks that a code can be used on an order of `amountCents` (the total after
 * the billing-period discount) and returns the discount it gives. `userId` is
 * optional so the public configurator can preview a code before login; the
 * per-user limit is then enforced again at checkout.
 */
export async function validateCoupon(
  code: string,
  amountCents: number,
  userId?: string,
  now: Date = new Date(),
): Promise<AppliedCoupon> {
  const coupon = await prisma.coupon.findUnique({
    where: { code: normalizeCouponCode(code) },
  });
  if (!coupon || !coupon.active) throw new AppError("coupon_not_found", 404);
  if (coupon.expiresAt && coupon.expiresAt <= now) throw new AppError("coupon_expired", 400);
  if (coupon.maxRedemptions !== null && coupon.timesRedeemed >= coupon.maxRedemptions) {
    throw new AppError("coupon_exhausted", 400);
  }
  if (amountCents < coupon.minOrderCents) {
    throw new AppError("coupon_min_order", 400, undefined, {
      minOrderCents: coupon.minOrderCents,
    });
  }
  if (userId) {
    const used = await prisma.couponRedemption.count({
      where: { couponId: coupon.id, userId },
    });
    if (used >= coupon.perUserLimit) throw new AppError("coupon_already_used", 400);
  }

  return { coupon, discountCents: couponDiscount(coupon, amountCents) };
}

/**
 * Records a redemption inside the fulfilment transaction. Limits are enforced
 * by `validateCoupon` when the order is created; by the time an order is
 * fulfilled the customer has already paid the discounted price, so this never
 * refuses. Worst case, two checkouts racing for the last use both go through.
 */
export async function redeemCoupon(
  tx: Prisma.TransactionClient,
  params: { couponId: string; userId: string; orderId: string; amountCents: number },
) {
  await tx.coupon.update({
    where: { id: params.couponId },
    data: { timesRedeemed: { increment: 1 } },
  });
  await tx.couponRedemption.create({
    data: {
      couponId: params.couponId,
      userId: params.userId,
      orderId: params.orderId,
      amountCents: params.amountCents,
    },
  });
}

// --- admin -------------------------------------------------------------------

export async function listCoupons() {
  return prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
}

export async function upsertCoupon(data: z.infer<typeof upsertCouponSchema>) {
  const { id, ...rest } = data;
  const payload = { ...rest, code: normalizeCouponCode(rest.code) };

  const clash = await prisma.coupon.findUnique({ where: { code: payload.code } });
  if (clash && clash.id !== id) throw new AppError("coupon_code_taken", 409);

  if (id) return prisma.coupon.update({ where: { id }, data: payload });
  return prisma.coupon.create({ data: payload });
}

/** Used coupons are kept for the order history and only switched off. */
export async function deleteCoupon(id: string) {
  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) throw new AppError("coupon_not_found", 404);
  if (coupon.timesRedeemed > 0) {
    return prisma.coupon.update({ where: { id }, data: { active: false } });
  }
  return prisma.coupon.delete({ where: { id } });
}
