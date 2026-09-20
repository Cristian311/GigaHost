"use client";

import { UserCheck, UserX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import type { TicketPriority, TicketStatus } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type AdminUpdateTicketInput,
} from "@/lib/validation/ticket";
import { adminUpdateTicketAction } from "@/server/actions/tickets";

export function TicketStatusControls({
  ticketId,
  status,
  priority,
  assignedToMe,
  assigneeLabel,
}: {
  ticketId: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedToMe: boolean;
  assigneeLabel: string | null;
}) {
  const t = useTranslations("support");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const statusItems = TICKET_STATUSES.map((value) => ({ value, label: t(`admin.statuses.${value}`) }));
  const priorityItems = TICKET_PRIORITIES.map((value) => ({ value, label: t(`priorities.${value}`) }));

  function update(input: AdminUpdateTicketInput) {
    startTransition(async () => {
      const result = await adminUpdateTicketAction(ticketId, input);
      if (!result.ok) {
        const key = `errors.${result.error}`;
        toast.error(t.has(key) ? t(key) : t("errors.internal_error"));
        return;
      }
      toast.success(t("admin.updated"));
      router.refresh();
    });
  }

  const select = (
    id: string,
    label: string,
    items: { value: string; label: string }[],
    value: string,
    onChange: (value: string) => void,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        items={items}
        value={value}
        disabled={pending}
        onValueChange={(v) => {
          if (v && v !== value) onChange(v as string);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-4">
      {select("ticket-status", t("status"), statusItems, status, (v) =>
        update({ status: v as TicketStatus }),
      )}
      {select("ticket-priority", t("priority"), priorityItems, priority, (v) =>
        update({ priority: v as TicketPriority }),
      )}
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t("admin.assignee")}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-muted-foreground">
            {assigneeLabel ?? t("admin.unassigned")}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => update({ assignToSelf: !assignedToMe })}
          >
            {assignedToMe ? <UserX data-icon="inline-start" /> : <UserCheck data-icon="inline-start" />}
            {assignedToMe ? t("admin.unassign") : t("admin.assignToMe")}
          </Button>
        </div>
      </div>
    </div>
  );
}
