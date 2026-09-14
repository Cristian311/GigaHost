import { getTranslations } from "next-intl/server";
import { FadeIn } from "@/components/motion/fade-in";
import { SectionHeading } from "@/components/section-heading";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export async function Faq() {
  const t = await getTranslations("landing.faq");
  const items = t.raw("items") as Array<{ q: string; a: string }>;

  return (
    <section id="faq" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <FadeIn>
          <SectionHeading eyebrow="FAQ" title={t("title")} />
        </FadeIn>
        <FadeIn delay={0.1}>
          <Accordion className="mt-12 rounded-2xl border border-white/5 bg-card/60 px-6">
            {items.map((item, index) => (
              <AccordionItem key={index} value={String(index)}>
                <AccordionTrigger className="py-4 text-base">{item.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </FadeIn>
      </div>
    </section>
  );
}
