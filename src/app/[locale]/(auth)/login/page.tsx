import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { oauthProviders } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title") };
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, search] = await Promise.all([getTranslations("auth.login"), searchParams]);
  const callbackUrl = typeof search.callbackUrl === "string" ? search.callbackUrl : undefined;
  const notice = typeof search.notice === "string" ? search.notice : undefined;

  return (
    <>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      <div className="mt-6">
        <LoginForm callbackUrl={callbackUrl} notice={notice} />
        <OAuthButtons google={oauthProviders.google} discord={oauthProviders.discord} />
      </div>
    </>
  );
}
