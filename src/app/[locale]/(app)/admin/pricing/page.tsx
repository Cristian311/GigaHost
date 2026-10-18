import { setRequestLocale } from "next-intl/server";
import { PricingForm } from "@/components/admin/pricing-form";
import { getActivePricing, toPricingTable } from "@/server/services/pricing-service";
import { requireAdmin } from "@/server/auth-guard";

export default async function AdminPricingPage({ params }: PageProps<"/[locale]/admin/pricing">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const pricing = await getActivePricing();
  return <PricingForm initial={toPricingTable(pricing)} />;
}
