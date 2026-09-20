import { useFormatter, useTranslations } from "next-intl";
import type {
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "@/generated/prisma/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { TicketPriorityBadge, TicketStatusBadge } from "./ticket-badges";

export type TicketListRow = {
  id: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  lastMessageAt: Date;
  server: { id: string; name: string } | null;
};

/** The customer's own tickets. */
export function TicketList({ tickets }: { tickets: TicketListRow[] }) {
  const t = useTranslations("support");
  const format = useFormatter();

  if (tickets.length === 0) {
    return (
      <p className="rounded-2xl border border-white/5 bg-card px-5 py-10 text-center text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/5 bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("subject")}</TableHead>
            <TableHead>{t("category")}</TableHead>
            <TableHead>{t("priority")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("lastActivity")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket) => (
            <TableRow key={ticket.id}>
              <TableCell className="max-w-80">
                <Link
                  href={`/dashboard/support/${ticket.id}`}
                  className="block truncate font-medium hover:underline"
                >
                  {ticket.subject}
                </Link>
                {ticket.server ? (
                  <p className="truncate text-xs text-muted-foreground">{ticket.server.name}</p>
                ) : null}
              </TableCell>
              <TableCell>{t(`categories.${ticket.category}`)}</TableCell>
              <TableCell>
                <TicketPriorityBadge priority={ticket.priority} />
              </TableCell>
              <TableCell>
                <TicketStatusBadge status={ticket.status} />
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
