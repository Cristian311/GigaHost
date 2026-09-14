import {
  Database,
  Gauge,
  Headset,
  HardDrive,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { FadeIn } from "@/components/motion/fade-in";
import { SectionHeading } from "@/components/section-heading";

const ICONS = {
  nvme: HardDrive,
  ddos: ShieldCheck,
  panel: Gauge,
  backups: Database,
  scale: TrendingUp,
  support: Headset,
} as const;

export async function Features() {
  const t = await getTranslations("landing.features");
  const keys = Object.keys(ICONS) as Array<keyof typeof ICONS>;

  return (
    <section id="features" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <FadeIn>
          <SectionHeading eyebrow="Features" title={t("title")} subtitle={t("subtitle")} />
        </FadeIn>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {keys.map((key, index) => {
            const Icon = ICONS[key];
            return (
              <FadeIn key={key} delay={index * 0.06}>
                <div className="group h-full rounded-2xl border border-white/5 bg-card/60 p-6 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">{t(`items.${key}.title`)}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{t(`items.${key}.desc`)}</p>
                </div>
              </FadeIn>
            );
          })}
        </div>
      </div>
    </section>
  );
}
