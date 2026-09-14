import type { Metadata } from "next";
import { Plus, Server } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ServerCard } from "@/components/dashboard/server-card";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth-guard";
import { listServersForUser } from "@/server/services/server-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

export default async function DashboardPage({ params }: PageProps<"/[locale]/dashboard">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [t, servers] = await Promise.all([getTranslations("dashboard"), listServersForUser(user.id)]);

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <Button render={<Link href="/configure" />}>
          <Plus data-icon="inline-start" /> {t("newServer")}
        </Button>
      </PageHeader>

      {servers.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-white/10 px-6 py-20 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Server className="size-7" />
          </span>
          <h2 className="mt-5 text-xl font-semibold">{t("empty.title")}</h2>
          <p className="mt-1 max-w-sm text-muted-foreground">{t("empty.desc")}</p>
          <Button className="glow-primary mt-6" size="lg" render={<Link href="/configure" />}>
            {t("empty.cta")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {servers.map((server) => (
            <ServerCard key={server.id} server={server} />
          ))}
        </div>
      )}
    </>
  );
}
