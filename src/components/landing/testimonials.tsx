import { Quote } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { FadeIn } from "@/components/motion/fade-in";
import { SectionHeading } from "@/components/section-heading";

export async function Testimonials() {
  const t = await getTranslations("landing.testimonials");
  const items = t.raw("items") as Array<{ quote: string; name: string; role: string }>;

  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <FadeIn>
          <SectionHeading eyebrow="Community" title={t("title")} />
        </FadeIn>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {items.map((item, index) => (
            <FadeIn key={item.name} delay={index * 0.07}>
              <figure className="glass flex h-full flex-col rounded-2xl p-6">
                <Quote className="size-6 text-primary" />
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-foreground/90">
                  “{item.quote}”
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-neon-2 text-xs font-bold text-primary-foreground">
                    {item.name.slice(0, 1)}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.role}</p>
                  </div>
                </figcaption>
              </figure>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
