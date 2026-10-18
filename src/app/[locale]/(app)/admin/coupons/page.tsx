import { setRequestLocale } from "next-intl/server";
import { CouponsManager } from "@/components/admin/coupons-manager";
import { listCoupons } from "@/server/services/coupon-service";
import { getActivePricing } from "@/server/services/pricing-service";
import { requireAdmin } from "@/server/auth-guard";

export default async function AdminCouponsPage({ params }: PageProps<"/[locale]/admin/coupons">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const [coupons, pricing] = await Promise.all([listCoupons(), getActivePricing()]);

  return (
    <CouponsManager
      currency={pricing.currency}
      coupons={coupons.map((coupon) => ({
        id: coupon.id,
        code: coupon.code,
        kind: coupon.kind,
        value: coupon.value,
        maxRedemptions: coupon.maxRedemptions,
        timesRedeemed: coupon.timesRedeemed,
        perUserLimit: coupon.perUserLimit,
        minOrderCents: coupon.minOrderCents,
        expiresAt: coupon.expiresAt ? coupon.expiresAt.toISOString().slice(0, 10) : null,
        active: coupon.active,
      }))}
    />
  );
}
