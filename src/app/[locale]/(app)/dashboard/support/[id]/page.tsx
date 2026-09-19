import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { CloseTicketButton } from "@/components/support/close-ticket-button";
import { TicketPriorityBadge, TicketStatusBadge } from "@/components/support/ticket-badges";
import { TicketThread } from "@/components/support/ticket-thread";
import { toThreadMessages } from "@/components/support/types";
import { Link, redirect } from "@/i18n/navigation";
import { requireUser } from "@/server/auth-guard";
import { AppError } from "@/server/errors";
import { getTicketForUser, listMessages } from "@/server/services/ticket-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("support");
  return { title: t("title") };
}

export default async function TicketPage({ params }: PageProps<"/[locale]/dashboard/support/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser();

  const ticket = await getTicketForUser(id, user.id).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "ticket_not_found") notFound();
    throw error;
  });
  // The open chat lives on its own page; ended chats stay readable here.
  if (ticket.kind === "CHAT" && ticket.status !== "CLOSED") {
    redirect({ href: "/dashboard/support/chat", locale });
  }

  const [t, format, thread] = await Promise.all([
    getTranslations("support"),
    getFormatter(),
    listMessages(ticket.id, user),
  ]);

  return (
    <>
      <Link
        href="/dashboard/support"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("backToSupport")}
      </Link>

      <PageHeader title={ticket.kind === "CHAT" ? t("chatSubject") : ticket.subject}>
        {ticket.status !== "CLOSED" ? (
          <CloseTicketButton ticketId={ticket.id} label={t("close")} confirmText={t("closeConfirm")} />
        ) : null}
      </PageHeader>

      <div className="-mt-4 mb-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <TicketStatusBadge status={ticket.status} />
        <TicketPriorityBadge priority={ticket.priority} />
        <span>{t(`categories.${ticket.category}`)}</span>
        {ticket.server ? (
          <>
            <span aria-hidden>·</span>
            <Link href={`/dashboard/servers/${ticket.server.id}`} className="hover:text-foreground hover:underline">
              {ticket.server.name}
            </Link>
          </>
        ) : null}
        <span aria-hidden>·</span>
        <span className="font-mono text-xs">#{ticket.id.slice(-8)}</span>
        <span aria-hidden>·</span>
        <span>{format.dateTime(ticket.createdAt, { dateStyle: "medium" })}</span>
      </div>

      <TicketThread
        ticketId={ticket.id}
        initialMessages={toThreadMessages(thread.messages)}
        status={ticket.status}
        viewerId={user.id}
        mode={ticket.kind === "CHAT" ? "chat" : "ticket"}
      />
    </>
  );
}
