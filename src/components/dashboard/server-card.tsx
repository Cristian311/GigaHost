import Image from "next/image";
import { ArrowUpRight, Cpu, HardDrive, MemoryStick } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { ServerWithRelations } from "@/server/services/server-service";
import { ServerStatusBadge } from "./server-status-badge";

export async function ServerCard({ server }: { server: ServerWithRelations }) {
  const t = await getTranslations("dashboard.server");

  return (
    <Link
      href={`/dashboard/servers/${server.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-card transition-all hover:-translate-y-0.5 hover:border-primary/40"
    >
      <div className="relative h-28">
        <Image src={server.game.image} alt="" fill unoptimized className="object-cover" sizes="400px" />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
        <div className="absolute top-3 right-3">
          <ServerStatusBadge status={server.status} />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5 pt-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-heading text-lg font-semibold">{server.name}</h3>
            <p className="truncate text-sm text-muted-foreground">
              {server.game.name} · {server.region.flag} {server.region.name}
            </p>
          </div>
          <ArrowUpRight className="size-5 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-1">
            <MemoryStick className="size-3.5" /> {server.ramGb} GB
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-1">
            <Cpu className="size-3.5" /> {server.vcpu} vCPU
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-1">
            <HardDrive className="size-3.5" /> {server.storageGb} GB
          </span>
        </div>
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          {server.ip ? `${server.ip}:${server.port}` : t("notAssigned")}
        </p>
      </div>
    </Link>
  );
}
