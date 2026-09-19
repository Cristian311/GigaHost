"use client";

import { Loader2, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { requestPasswordResetAction, type SimpleFormState } from "@/server/actions/auth";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<SimpleFormState, FormData>(
    requestPasswordResetAction,
    {},
  );

  if (state.ok) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/10 p-5 text-sm">
        <p className="flex items-center gap-2 font-medium text-success">
          <MailCheck className="size-4" /> {t("forgot.sentTitle")}
        </p>
        <p className="mt-2 text-muted-foreground">{t("forgot.sentBody")}</p>
      </div>
    );
  }

  const errorKey = state.error ? (`errors.${state.error}` as const) : null;

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t("login.email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      {errorKey ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t.has(errorKey) ? t(errorKey) : t("errors.internal_error")}
        </p>
      ) : null}

      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {t("forgot.submit")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t("forgot.backToLogin")}
        </Link>
      </p>
    </form>
  );
}
