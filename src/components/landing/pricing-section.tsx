import { getTranslations } from "next-intl/server";
import { FadeIn } from "@/components/motion/fade-in";
import { SectionHeading } from "@/components/section-heading";
import { toConfiguratorGames, toConfiguratorRegions } from "@/lib/configurator-data";
import { getConfiguratorData } from "@/server/services/pricing-service";
import { PricingPreview } from "./pricing-preview";

export async function PricingSection() {
  const [t, data] = await Promise.all([getTranslations("landing.pricing"), getConfiguratorData()]);

  return (
    <section id="pricing" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <FadeIn>
          <SectionHeading eyebrow="Pricing" title={t("title")} subtitle={t("subtitle")} />
        </FadeIn>
        <FadeIn delay={0.1} className="mt-14">
          <PricingPreview
            games={toConfiguratorGames(data.games)}
            regions={toConfiguratorRegions(data.regions)}
            pricing={data.pricing}
          />
        </FadeIn>
      </div>
    </section>
  );
}
