import { Search } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ServerStatus } from "@/generated/prisma/client";
import { AdminServersTable } from "@/components/admin/servers-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/server/auth-guard";
import { listAllServers } from "@/server/services/server-service";

const STATUS_FILTERS: ServerStatus[] = [
  "RUNNING",
  "STOPPED",
  "INSTALLING",
  "STARTING",
  "STOPPING",
  "SUSPENDED",
  "ERROR",
  "PENDING",
];

const LIST_LIMIT = 200;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function filterHref(status: ServerStatus | undefined, q: string) {
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (q) query.set("q", q);
  const search = query.toString();
  return search ? `/admin/servers?${search}` : "/admin/servers";
}

export default async function AdminServersPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/servers">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();

  const query = await searchParams;
  const q = first(query.q)?.trim() ?? "";
  const rawStatus = first(query.status);
  const status = STATUS_FILTERS.find((s) => s === rawStatus);

  const [t, ts, servers] = await Promise.all([
    getTranslations("admin.servers"),
    getTranslations("dashboard.status"),
    listAllServers({ status, q }),
  ]);

  const chip = (value: ServerStatus | undefined, label: string) => (
    <Link
      key={value ?? "all"}
      href={filterHref(value, q)}
      className={cn(
        "shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
        status === value
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/5 bg-card/60 p-1">
          {chip(undefined, t("all"))}
          {STATUS_FILTERS.map((s) => chip(s, ts(s)))}
        </div>
        {/* Plain GET form: submits to the current URL, keeping the status filter. */}
        <form className="flex gap-2 lg:w-96">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <Input name="q" defaultValue={q} placeholder={t("searchPlaceholder")} aria-label={t("search")} />
          <Button type="submit" variant="outline">
            <Search data-icon="inline-start" /> {t("search")}
          </Button>
        </form>
      </div>

      <AdminServersTable
        servers={servers.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          lastError: s.lastError,
          ownerEmail: s.owner.email,
          gameName: s.game.name,
          regionFlag: s.region.flag,
          regionName: s.region.name,
          ramGb: s.ramGb,
          vcpu: s.vcpu,
          storageGb: s.storageGb,
          address: s.ip ? `${s.ip}:${s.port}` : null,
          createdAt: s.createdAt,
        }))}
      />

      {servers.length >= LIST_LIMIT ? (
        <p className="mt-3 text-xs text-muted-foreground">{t("limitNotice")}</p>
      ) : null}
    </>
  );
}
