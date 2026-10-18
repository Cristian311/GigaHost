"use client";

import { Download, Loader2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteAccountAction } from "@/server/actions/account";

/**
 * The two GDPR rights a customer should not have to email anyone to use:
 * article 15/20 (a copy of their data) and article 17 (erasure).
 */
export function PrivacySection({ hasPassword }: { hasPassword: boolean }) {
  const t = useTranslations("account.privacy");
  const tc = useTranslations("common");
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteAccountAction({ password });
      // On success the action signs out and redirects, so reaching here at all
      // means it failed.
      if (result && !result.ok) {
        toast.error(
          result.error === "invalid_credentials" ? t("wrongPassword") : tc("error"),
        );
      }
    });
  }

  return (
    <section className="rounded-2xl border border-white/5 bg-card p-6">
      <h2 className="mb-5 text-lg font-semibold">{t("title")}</h2>

      <div className="mb-8">
        <h3 className="text-sm font-medium">{t("exportTitle")}</h3>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">{t("exportDesc")}</p>
        {/* A plain link, not fetch(): the browser handles the download and the
            Content-Disposition header names the file. */}
        <Button variant="outline" render={<a href="/api/account/export" download />}>
          <Download data-icon="inline-start" />
          {t("exportButton")}
        </Button>
      </div>

      <div className="border-t border-white/5 pt-6">
        <h3 className="text-sm font-medium text-destructive">{t("deleteTitle")}</h3>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">{t("deleteDesc")}</p>

        {!hasPassword ? (
          <p className="text-sm text-muted-foreground">{t("deleteNeedsPassword")}</p>
        ) : confirming ? (
          <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="flex gap-2 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {t("deleteWarning")}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="delete-password">{t("confirmPassword")}</Label>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={remove}
                disabled={pending || password.length < 8}
              >
                {pending ? <Loader2 className="animate-spin" /> : null}
                {t("deleteConfirm")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirming(false);
                  setPassword("");
                }}
                disabled={pending}
              >
                {tc("cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setConfirming(true)}>
            {t("deleteButton")}
          </Button>
        )}
      </div>
    </section>
  );
}
