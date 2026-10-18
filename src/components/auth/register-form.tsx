"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { registerAction, type AuthFormState } from "@/server/actions/auth";

export function RegisterForm({ callbackUrl }: { callbackUrl?: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<AuthFormState, FormData>(registerAction, {});

  const fieldError = (field: string) => {
    const errors = state.fieldErrors?.[field];
    if (!errors?.length) return null;
    const code = errors[0];
    if (code === "passwords_mismatch") return t("errors.passwords_mismatch");
    if (field === "password") return t("errors.password_short");
    return t("errors.validation");
  };

  return (
    <form action={action} className="space-y-4">
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}

      <div className="space-y-2">
        <Label htmlFor="name">{t("register.name")}</Label>
        <Input id="name" name="name" autoComplete="name" minLength={2} required />
        {fieldError("name") ? <p className="text-xs text-destructive">{fieldError("name")}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{t("register.email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
        {fieldError("email") ? <p className="text-xs text-destructive">{fieldError("email")}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="password">{t("register.password")}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          {fieldError("password") ? (
            <p className="text-xs text-destructive">{fieldError("password")}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">{t("register.confirmPassword")}</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          {fieldError("confirmPassword") ? (
            <p className="text-xs text-destructive">{fieldError("confirmPassword")}</p>
          ) : null}
        </div>
      </div>

      {/* Never pre-ticked: a box that arrives already checked is not consent,
          and the GDPR and the consumer directive both say so. */}
      <div className="flex gap-3">
        <input
          id="acceptTerms"
          name="acceptTerms"
          type="checkbox"
          required
          className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
        />
        <Label htmlFor="acceptTerms" className="text-sm font-normal leading-snug text-muted-foreground">
          {t.rich("register.acceptTerms", {
            terms: (chunks) => (
              <Link href="/legal/terms" className="text-primary hover:underline">
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link href="/legal/privacy" className="text-primary hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </Label>
      </div>
      {fieldError("acceptTerms") ? (
        <p className="text-xs text-destructive">{t("register.acceptTermsRequired")}</p>
      ) : null}

      {state.error && state.error !== "validation" ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(`errors.${state.error}` as "errors.email_taken")}
        </p>
      ) : null}

      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {pending ? t("register.submitting") : t("register.submit")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t("register.hasAccount")}{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t("register.login")}
        </Link>
      </p>
    </form>
  );
}
