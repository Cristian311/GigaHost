import { setRequestLocale } from "next-intl/server";
import { RegionsManager } from "@/components/admin/regions-manager";
import { requireAdmin } from "@/server/auth-guard";
import { listRegions } from "@/server/services/admin-service";

export default async function AdminRegionsPage({ params }: PageProps<"/[locale]/admin/regions">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const regions = await listRegions();
  return (
    <RegionsManager
      regions={regions.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        country: r.country,
        flag: r.flag,
        priceMultiplier: r.priceMultiplier,
        active: r.active,
        sortOrder: r.sortOrder,
        pterodactylLocationId: r.pterodactylLocationId,
        serverCount: r._count.servers,
      }))}
    />
  );
}
