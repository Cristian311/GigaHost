"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { setCancelAtPeriodEndAction } from "@/server/actions/servers";

export function SubscriptionActions({
  subscriptionId,
  cancelAtPeriodEnd,
}: {
  subscriptionId: string;
  cancelAtPeriodEnd: boolean;
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

  return (
    <Button size="sm" variant="outline" onClick={toggle} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {cancelAtPeriodEnd ? t("resume") : t("cancelAtPeriodEnd")}
    </Button>
  );
}
