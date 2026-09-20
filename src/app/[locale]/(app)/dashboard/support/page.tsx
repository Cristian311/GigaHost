import type { Metadata } from "next";
import { MessagesSquare, Plus } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { TicketList } from "@/components/support/ticket-list";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth-guard";
import { findOpenChat, listTicketsForUser } from "@/server/services/ticket-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("support");
  return { title: t("title") };
}

export default async function SupportPage({ params }: PageProps<"/[locale]/dashboard/support">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();

  const [t, tickets, chat] = await Promise.all([
    getTranslations("support"),
    listTicketsForUser(user.id),
    findOpenChat(user.id),
  ]);

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <Button variant="outline" render={<Link href="/dashboard/support/chat" />}>
          <MessagesSquare data-icon="inline-start" /> {t("liveChat")}
        </Button>
        <Button render={<Link href="/dashboard/support/new" />}>
          <Plus data-icon="inline-start" /> {t("newTicket")}
        </Button>
      </PageHeader>

      {chat ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          <span>{t("openChat")}</span>
          <Button size="sm" render={<Link href="/dashboard/support/chat" />}>
            {t("continueChat")}
          </Button>
        </div>
      ) : null}

      <TicketList tickets={tickets} />
    </>
  );
}
