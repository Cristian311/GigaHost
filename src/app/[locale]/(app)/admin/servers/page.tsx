import { setRequestLocale } from "next-intl/server";
import { AdminServersTable } from "@/components/admin/admin-servers-table";
import { listAllServers } from "@/server/services/admin-service";

export default async function AdminServersPage({ params }: PageProps<"/[locale]/admin/servers">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const servers = await listAllServers();

  return (
    <AdminServersTable
      servers={servers.map((server) => ({
        id: server.id,
        name: server.name,
        status: server.status,
        ramGb: server.ramGb,
        vcpu: server.vcpu,
        storageGb: server.storageGb,
        createdAt: server.createdAt,
        owner: server.owner,
        game: server.game,
        region: server.region,
      }))}
    />
  );
}
