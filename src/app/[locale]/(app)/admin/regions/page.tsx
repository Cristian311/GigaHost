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
      regions={regions.map((region) => ({
        id: region.id,
        code: region.code,
        name: region.name,
        country: region.country,
        flag: region.flag,
        priceMultiplier: region.priceMultiplier,
        active: region.active,
        sortOrder: region.sortOrder,
        pterodactylLocationId: region.pterodactylLocationId,
        serverCount: region._count.servers,
      }))}
    />
  );
}
