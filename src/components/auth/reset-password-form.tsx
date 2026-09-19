"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { resetPasswordAction, type SimpleFormState } from "@/server/actions/auth";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<SimpleFormState, FormData>(
    resetPasswordAction,
    {},
  );

  if (state.ok) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/10 p-5 text-sm">
        <p className="flex items-center gap-2 font-medium text-success">
          <CheckCircle2 className="size-4" /> {t("reset.doneTitle")}
        </p>
        <p className="mt-2 text-muted-foreground">{t("reset.doneBody")}</p>
        <Button className="mt-4" render={<Link href="/login" />}>
          {t("login.submit")}
        </Button>
      </div>
    );
  }

  const errorKey = state.error ? (`errors.${state.error}` as const) : null;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-2">
        <Label htmlFor="password">{t("reset.newPassword")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">{t("reset.confirmPassword")}</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      {errorKey ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t.has(errorKey) ? t(errorKey) : t("errors.internal_error")}
        </p>
      ) : null}

      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {t("reset.submit")}
      </Button>
    </form>
  );
}
