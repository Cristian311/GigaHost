import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { Configurator } from "@/components/configurator/configurator";
import { SectionHeading } from "@/components/section-heading";
import { toConfiguratorGames, toConfiguratorRegions } from "@/lib/configurator-data";
import { alternates } from "@/lib/seo";
import { isStripeEnabled } from "@/server/payments/stripe-client";
import { getConfiguratorData } from "@/server/services/pricing-service";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/configure">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("configure");
  return { title: t("title"), alternates: alternates(locale, "/configure") };
}

export default async function ConfigurePage({
  params,
  searchParams,
}: PageProps<"/[locale]/configure">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, data, session, search] = await Promise.all([
    getTranslations("configure"),
    getConfiguratorData(),
    auth(),
    searchParams,
  ]);

  const initialSearch = new URLSearchParams(
    Object.entries(search).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : [],
    ),
  ).toString();

  return (
    <div className="bg-glow">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeading align="left" title={t("title")} subtitle={t("subtitle")} className="max-w-3xl" />
        <div className="mt-12">
          <Configurator
            games={toConfiguratorGames(data.games)}
            regions={toConfiguratorRegions(data.regions)}
            pricing={data.pricing}
            initialSearch={initialSearch}
            isAuthenticated={Boolean(session?.user)}
            paymentsAreReal={isStripeEnabled()}
          />
        </div>
      </div>
    </div>
  );
}
