import { setRequestLocale } from "next-intl/server";
import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { GamesGrid } from "@/components/landing/games-grid";
import { Hero } from "@/components/landing/hero";
import { PricingSection } from "@/components/landing/pricing-section";
import { Testimonials } from "@/components/landing/testimonials";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <Hero />
      <Features />
      <GamesGrid />
      <PricingSection />
      <Testimonials />
      <Faq />
    </>
  );
}
