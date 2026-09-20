"use client";

import { XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { closeTicketAction } from "@/server/actions/tickets";

export function CloseTicketButton({
  ticketId,
  label,
  confirmText,
  redirectTo,
}: {
  ticketId: string;
  label: string;
  confirmText: string;
  /** Where to go afterwards; refreshes the current page when omitted. */
  redirectTo?: string;
}) {
  const t = useTranslations("support");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function close() {
    if (!window.confirm(confirmText)) return;
    startTransition(async () => {
      const result = await closeTicketAction(ticketId);
      if (!result.ok) {
        const key = `errors.${result.error}`;
        toast.error(t.has(key) ? t(key) : t("errors.internal_error"));
        return;
      }
      toast.success(t("closedToast"));
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  return (
    <Button variant="outline" disabled={pending} onClick={close}>
      <XCircle data-icon="inline-start" /> {label}
    </Button>
  );
}
