"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { oauthSignInAction } from "@/server/actions/auth";

export function OAuthButtons({ google, discord }: { google: boolean; discord: boolean }) {
  const t = useTranslations("auth.oauth");
  if (!google && !discord) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-white/10" />
        {t("or")}
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <div className="mt-4 grid gap-2">
        {google ? (
          <Button variant="outline" className="w-full" onClick={() => oauthSignInAction("google")}>
            {t("google")}
          </Button>
        ) : null}
        {discord ? (
          <Button variant="outline" className="w-full" onClick={() => oauthSignInAction("discord")}>
            {t("discord")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
