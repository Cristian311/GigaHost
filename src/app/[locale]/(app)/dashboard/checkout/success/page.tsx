import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckoutStatus } from "@/components/dashboard/checkout-status";
import { redirect } from "@/i18n/navigation";
import { requireUser } from "@/server/auth-guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkout");
  return { title: t("pending.title") };
}

export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: PageProps<"/[locale]/dashboard/checkout/success">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  await requireUser();

  const orderId = typeof query.order === "string" ? query.order : null;
  if (!orderId) redirect({ href: "/dashboard", locale });

  return (
    <div className="py-16">
      <CheckoutStatus orderId={orderId!} />
    </div>
  );
}
