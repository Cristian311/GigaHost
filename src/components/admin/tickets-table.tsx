import { MessagesSquare } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type {
  TicketKind,
  TicketPriority,
  TicketStatus,
} from "@/generated/prisma/client";
import { TicketPriorityBadge, TicketStatusBadge } from "@/components/support/ticket-badges";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type AdminTicketRow = {
  id: string;
  kind: TicketKind;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  awaitingStaff: boolean;
  customer: string;
  customerEmail: string;
  assignee: string | null;
  lastMessageAt: Date;
};

export function AdminTicketsTable({ tickets }: { tickets: AdminTicketRow[] }) {
  const t = useTranslations("support");
  const format = useFormatter();

  if (tickets.length === 0) {
    return (
      <p className="rounded-2xl border border-white/5 bg-card px-5 py-10 text-center text-sm text-muted-foreground">
        {t("admin.empty")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/5 bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("admin.ticket")}</TableHead>
            <TableHead>{t("admin.customer")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("priority")}</TableHead>
            <TableHead>{t("admin.assignee")}</TableHead>
            <TableHead>{t("lastActivity")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket) => (
            <TableRow key={ticket.id} className={cn(ticket.awaitingStaff && "bg-primary/[0.06]")}>
              <TableCell className="max-w-80">
                <div className="flex items-center gap-2">
                  {ticket.awaitingStaff ? (
                    <span className="size-2 shrink-0 rounded-full bg-primary" title={t("admin.needsReply")} />
                  ) : null}
                  <Link
                    href={`/admin/tickets/${ticket.id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {ticket.kind === "CHAT" ? t("chatSubject") : ticket.subject}
                  </Link>
                  {ticket.kind === "CHAT" ? (
                    <Badge variant="outline" className="shrink-0">
                      <MessagesSquare /> {t("admin.kinds.CHAT")}
                    </Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <p className="truncate">{ticket.customer}</p>
                {ticket.customer !== ticket.customerEmail ? (
                  <p className="truncate text-xs text-muted-foreground">{ticket.customerEmail}</p>
                ) : null}
              </TableCell>
              <TableCell>
                <TicketStatusBadge status={ticket.status} staffView />
              </TableCell>
              <TableCell>
                <TicketPriorityBadge priority={ticket.priority} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {ticket.assignee ?? t("admin.unassigned")}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {format.relativeTime(ticket.lastMessageAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
