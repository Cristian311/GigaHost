"use client";

import { Loader2, MailWarning } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resendVerificationAction } from "@/server/actions/auth";

/** Shown across the dashboard until the customer confirms their address. */
export function VerifyEmailBanner({ email }: { email: string }) {
  const t = useTranslations("verifyBanner");
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  function resend() {
    startTransition(async () => {
      const result = await resendVerificationAction();
      if (result.error) {
        const key = `errors.${result.error}` as const;
        toast.error(t.has(key) ? t(key) : t("errors.internal_error"));
        return;
      }
      setSent(true);
      toast.success(t("sent", { email }));
    });
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
      <p className="flex items-start gap-2 text-warning">
        <MailWarning className="mt-0.5 size-4 shrink-0" />
        <span>{t("message", { email })}</span>
      </p>
      <Button size="sm" variant="outline" onClick={resend} disabled={pending || sent}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {sent ? t("sentShort") : t("resend")}
      </Button>
    </div>
  );
}
