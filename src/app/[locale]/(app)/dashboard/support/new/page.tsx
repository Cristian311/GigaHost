import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { NewTicketForm } from "@/components/support/new-ticket-form";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth-guard";
import { listTicketServerOptions } from "@/server/services/ticket-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("support");
  return { title: t("newTicket") };
}

/** `?server=<id>` preselects one of the customer's servers. */
export default async function NewTicketPage({
  params,
  searchParams,
}: PageProps<"/[locale]/dashboard/support/new">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();

  const [t, servers, query] = await Promise.all([
    getTranslations("support"),
    listTicketServerOptions(user.id),
    searchParams,
  ]);
  const requested = typeof query.server === "string" ? query.server : undefined;
  const defaultServerId = servers.some((s) => s.id === requested) ? requested : undefined;

  return (
    <>
      <Link
        href="/dashboard/support"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("backToSupport")}
      </Link>
      <PageHeader title={t("newTicket")} subtitle={t("newTicketSubtitle")} />
      <NewTicketForm servers={servers} defaultServerId={defaultServerId} />
    </>
  );
}
