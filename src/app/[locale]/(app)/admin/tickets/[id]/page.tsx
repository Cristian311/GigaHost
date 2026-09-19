import { ArrowLeft, MessagesSquare } from "lucide-react";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ServerStatusBadge } from "@/components/dashboard/server-status-badge";
import { AdminSupportPulse } from "@/components/support/admin-support-pulse";
import { TicketPriorityBadge, TicketStatusBadge } from "@/components/support/ticket-badges";
import { TicketStatusControls } from "@/components/support/ticket-status-controls";
import { TicketThread } from "@/components/support/ticket-thread";
import { toThreadMessages } from "@/components/support/types";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/server/auth-guard";
import { AppError } from "@/server/errors";
import { getTicketForAdmin, listMessages } from "@/server/services/ticket-service";

export default async function AdminTicketPage({ params }: PageProps<"/[locale]/admin/tickets/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const admin = await requireAdmin();

  const ticket = await getTicketForAdmin(id).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "ticket_not_found") notFound();
    throw error;
  });

  const [t, format, thread] = await Promise.all([
    getTranslations("support"),
    getFormatter(),
    listMessages(ticket.id, admin),
  ]);
  const customerName = ticket.user.name ?? ticket.user.email;

  return (
    <>
      <AdminSupportPulse />

      <Link
        href="/admin/tickets"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("admin.backToTickets")}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          <div>
            <h2 className="text-xl font-semibold break-words">
              {ticket.kind === "CHAT" ? t("chatSubject") : ticket.subject}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {ticket.kind === "CHAT" ? (
                <Badge variant="outline">
                  <MessagesSquare /> {t("admin.kinds.CHAT")}
                </Badge>
              ) : null}
              <TicketStatusBadge status={ticket.status} staffView />
              <TicketPriorityBadge priority={ticket.priority} />
              <span>{t(`categories.${ticket.category}`)}</span>
              <span aria-hidden>·</span>
              <span className="font-mono text-xs">#{ticket.id.slice(-8)}</span>
              <span aria-hidden>·</span>
              <span>
                {t("admin.created")} {format.dateTime(ticket.createdAt, { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>
          </div>

          <TicketThread
            ticketId={ticket.id}
            initialMessages={toThreadMessages(thread.messages)}
            status={ticket.status}
            viewerId={admin.id}
            mode={ticket.kind === "CHAT" ? "chat" : "ticket"}
            customerName={customerName}
            staffView
          />
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/5 bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-muted-foreground uppercase">{t("admin.details")}</h3>
            <TicketStatusControls
              ticketId={ticket.id}
              status={ticket.status}
              priority={ticket.priority}
              assignedToMe={ticket.assigneeId === admin.id}
              assigneeLabel={ticket.assignee ? (ticket.assignee.name ?? ticket.assignee.email) : null}
            />
          </section>

          <section className="space-y-3 rounded-2xl border border-white/5 bg-card p-5 text-sm">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase">{t("admin.customer")}</h3>
            <div>
              <p className="font-medium break-words">{customerName}</p>
              {ticket.user.name ? (
                <p className="break-all text-muted-foreground">{ticket.user.email}</p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {t("admin.customerSince", {
                  date: format.dateTime(ticket.user.createdAt, { dateStyle: "medium" }),
                })}
              </p>
            </div>
            {ticket.server ? (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">{t("admin.linkedServer")}</p>
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/admin/servers?q=${encodeURIComponent(ticket.server.name)}`}
                    className="truncate font-medium hover:underline"
                  >
                    {ticket.server.name}
                  </Link>
                  <ServerStatusBadge status={ticket.server.status} />
                </div>
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </>
  );
}
