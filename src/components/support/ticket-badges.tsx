import { useTranslations } from "next-intl";
import type { TicketPriority, TicketStatus } from "@/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { TICKET_PRIORITY_VARIANT, TICKET_STATUS_VARIANT } from "@/lib/ticket-status";

/** `staffView` words PENDING as "awaiting customer" instead of "awaiting your reply". */
export function TicketStatusBadge({
  status,
  staffView = false,
}: {
  status: TicketStatus;
  staffView?: boolean;
}) {
  const t = useTranslations("support");
  return (
    <Badge variant={TICKET_STATUS_VARIANT[status]}>
      {staffView ? t(`admin.statuses.${status}`) : t(`statuses.${status}`)}
    </Badge>
  );
}

export function TicketPriorityBadge({ priority }: { priority: TicketPriority }) {
  const t = useTranslations("support");
  return <Badge variant={TICKET_PRIORITY_VARIANT[priority]}>{t(`priorities.${priority}`)}</Badge>;
}
