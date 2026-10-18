import { NextResponse } from "next/server";
import { couponPreviewSchema } from "@/lib/validation/server";
import { parseJson, withApi } from "@/server/api";
import { getOptionalUser } from "@/server/auth-guard";
import { RATE_LIMITS, assertRateLimit, clientIp } from "@/server/security/rate-limit";
import { validateCoupon } from "@/server/services/coupon-service";
import { quote } from "@/server/services/pricing-service";

/** Prices a coupon against a configuration. Public, like the quote endpoint. */
export async function POST(request: Request) {
  return withApi(request, async () => {
    const { couponCode, ...config } = await parseJson(request, couponPreviewSchema);
    // Codes are guessable; this keeps the endpoint from being used to find them.
    await assertRateLimit(`coupon:${clientIp(request.headers)}`, RATE_LIMITS.couponPreview);
    const [{ breakdown }, user] = await Promise.all([quote(config), getOptionalUser()]);
    const applied = await validateCoupon(couponCode, breakdown.totalCents, user?.id);
    return NextResponse.json({
      code: applied.coupon.code,
      discountCents: applied.discountCents,
      totalCents: breakdown.totalCents - applied.discountCents,
      currency: breakdown.currency,
    });
  });
}
