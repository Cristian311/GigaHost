import { ArrowRight, Cpu, Gamepad2, MemoryStick, Sparkles, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export function Hero() {
  const t = useTranslations("landing.hero");

  const stats = [
    { value: "99.9%", label: t("stats.uptime") },
    { value: "< 60s", label: t("stats.deploy") },
    { value: "4", label: t("stats.regions") },
    { value: "24/7", label: t("stats.support") },
  ];

  return (
    <section className="bg-glow relative overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden />
      {/* CSS-driven entrance animations: the hero paints immediately, before hydration. */}
      <div className="relative mx-auto grid max-w-7xl gap-14 px-4 pt-20 pb-24 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-28 lg:pb-32">
        <div>
          <div className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500">
            <Badge variant="outline" className="h-7 gap-1.5 border-primary/40 bg-primary/10 px-3 text-primary">
              <Sparkles className="size-3.5" />
              {t("badge")}
            </Badge>
          </div>

          <h1 className="mt-6 animate-in fade-in slide-in-from-bottom-4 fill-mode-both text-4xl font-bold leading-[1.05] delay-75 duration-700 sm:text-6xl lg:text-7xl">
            {t("title1")} <span className="text-gradient">{t("title2")}</span>
          </h1>

          <p className="mt-6 max-w-xl animate-in fade-in slide-in-from-bottom-4 fill-mode-both text-lg text-muted-foreground delay-150 duration-700">
            {t("subtitle")}
          </p>

          <div className="mt-8 flex animate-in fade-in slide-in-from-bottom-4 fill-mode-both flex-col gap-3 delay-200 duration-700 sm:flex-row">
            <Button size="lg" className="glow-primary h-11 px-6 text-base" render={<Link href="/configure" />}>
              {t("ctaPrimary")}
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-11 px-6 text-base"
              render={<Link href="/games" />}
            >
              <Gamepad2 data-icon="inline-start" />
              {t("ctaSecondary")}
            </Button>
          </div>

          <dl className="mt-12 grid animate-in fade-in fill-mode-both grid-cols-2 gap-6 delay-300 duration-700 sm:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label}>
                <dt className="font-heading text-2xl font-bold">{stat.value}</dt>
                <dd className="text-sm text-muted-foreground">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative animate-in fade-in zoom-in-95 slide-in-from-bottom-6 fill-mode-both delay-200 duration-700">
          <HeroPanel />
        </div>
      </div>
    </section>
  );
}

/** Decorative preview of the dashboard. */
function HeroPanel() {
  const t = useTranslations("dashboard.server");
  const status = useTranslations("dashboard.status");

  return (
    <div className="animate-float">
      <div className="glass relative rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#22c55e]/15 text-[#22c55e]">
              <Gamepad2 className="size-5" />
            </div>
            <div>
              <p className="font-semibold">Friday Night SMP</p>
              <p className="text-xs text-muted-foreground">Minecraft: Java · Bucharest</p>
            </div>
          </div>
          <span className="flex items-center gap-2 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
            <span className="animate-pulse-ring size-2 rounded-full bg-success" />
            {status("RUNNING")}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <Metric icon={<Cpu className="size-4" />} label={t("cpu")} value="34%" progress={34} />
          <Metric
            icon={<MemoryStick className="size-4" />}
            label={t("ram")}
            value="5.1 / 8 GB"
            progress={64}
          />
          <Metric icon={<Users className="size-4" />} label={t("players")} value="12 / 40" progress={30} />
        </div>

        <div className="mt-5 rounded-xl bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
          <p>
            <span className="text-success">[INFO]</span> Preparing spawn area: 100%
          </p>
          <p>
            <span className="text-success">[INFO]</span> Done (4.7s)! For help, type &quot;help&quot;
          </p>
          <p>
            <span className="text-success">[INFO]</span> Nova joined the game
          </p>
          <p>
            <span className="text-neon-2">[BACKUP]</span> Snapshot completed (12.4 MB)
          </p>
        </div>
      </div>

      <div
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-primary/25 blur-3xl"
        aria-hidden
      />
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  progress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  progress: number;
}) {
  return (
    <div className="rounded-xl bg-white/[0.04] p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-sm font-semibold">{value}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-neon-2"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
