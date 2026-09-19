"use client";

import { CreditCard, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { payOutstandingAction, setCancelAtPeriodEndAction } from "@/server/actions/servers";

export function SubscriptionActions({
  subscriptionId,
  cancelAtPeriodEnd,
  pastDue = false,
}: {
  subscriptionId: string;
  cancelAtPeriodEnd: boolean;
  pastDue?: boolean;
}) {
  const t = useTranslations("billing");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = await setCancelAtPeriodEndAction(subscriptionId, !cancelAtPeriodEnd);
      if (!result.ok) {
        toast.error(tc("error"));
        return;
      }
      router.refresh();
    });
  }

  function payNow() {
    startTransition(async () => {
      const result = await payOutstandingAction(subscriptionId);
      if (!result.ok) {
        const key = `errors.${result.error}` as const;
        toast.error(t.has(key) ? t(key) : t("errors.internal_error"));
        return;
      }
      toast.success(t("paid"));
      router.refresh();
    });
  }

  if (pastDue) {
    return (
      <Button size="sm" onClick={payNow} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <CreditCard data-icon="inline-start" />}
        {pending ? t("paying") : t("payNow")}
      </Button>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={toggle} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {cancelAtPeriodEnd ? t("resume") : t("cancelAtPeriodEnd")}
    </Button>
  );
}
