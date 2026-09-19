"use client";

import { CreditCard, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openPaymentPortalAction } from "@/server/actions/servers";

/** Sends the customer to the gateway-hosted page for replacing their card. */
export function PaymentMethodButton() {
  const t = useTranslations("billing");
  const [pending, startTransition] = useTransition();

  function open() {
    startTransition(async () => {
      const result = await openPaymentPortalAction();
      if (!result.ok) {
        const key = `errors.${result.error}` as const;
        toast.error(t.has(key) ? t(key) : t("errors.internal_error"));
        return;
      }
      window.location.assign(result.data.url);
    });
  }

  return (
    <Button variant="outline" onClick={open} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <CreditCard data-icon="inline-start" />}
      {t("managePaymentMethod")}
    </Button>
  );
}
