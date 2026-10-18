import { setRequestLocale } from "next-intl/server";
import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { GamesGrid } from "@/components/landing/games-grid";
import { Hero } from "@/components/landing/hero";
import { PricingSection } from "@/components/landing/pricing-section";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <Hero />
      <Features />
      <GamesGrid />
      <PricingSection />
      {/* A testimonials section used to sit here. Its quotes were invented, and
          publishing a made-up consumer review is a banned practice under the EU
          Unfair Commercial Practices Directive (Annex I, as amended by the
          Omnibus Directive) — not marketing licence. Both the component and the
          copy were removed rather than hidden, because the messages ship to the
          browser whether the section renders or not. Build it again when there
          are real quotes from customers who agreed to be named. */}
      <Faq />
    </>
  );
}
