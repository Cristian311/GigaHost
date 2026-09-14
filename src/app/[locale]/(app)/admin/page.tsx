import { Activity, Server, ShoppingCart, Users, Wallet } from "lucide-react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { formatMoney } from "@/lib/pricing/calculate-price";
import { getAdminStats } from "@/server/services/admin-service";
import { getActivePricing } from "@/server/services/pricing-service";

export default async function AdminOverviewPage({ params }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, currentLocale, stats, pricing] = await Promise.all([
    getTranslations("admin.stats"),
    getLocale(),
    getAdminStats(),
    getActivePricing(),
  ]);

  const tiles = [
    { icon: Users, label: t("users"), value: String(stats.users) },
    { icon: Server, label: t("servers"), value: String(stats.servers) },
    { icon: Activity, label: t("running"), value: String(stats.runningServers) },
    { icon: ShoppingCart, label: t("orders"), value: String(stats.orders) },
    {
      icon: Wallet,
      label: t("revenue"),
      value: formatMoney(stats.revenueCents, pricing.currency, currentLocale),
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-2xl border border-white/5 bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <tile.icon className="size-4" /> {tile.label}
          </div>
          <p className="mt-2 font-heading text-3xl font-bold tabular-nums">{tile.value}</p>
        </div>
      ))}
    </div>
  );
}
