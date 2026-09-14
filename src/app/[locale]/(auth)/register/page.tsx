import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { oauthProviders } from "@/auth";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { RegisterForm } from "@/components/auth/register-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.register");
  return { title: t("title") };
}

export default async function RegisterPage({
  params,
  searchParams,
}: PageProps<"/[locale]/register">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, search] = await Promise.all([getTranslations("auth.register"), searchParams]);
  const callbackUrl = typeof search.callbackUrl === "string" ? search.callbackUrl : undefined;

  return (
    <>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      <div className="mt-6">
        <RegisterForm callbackUrl={callbackUrl} />
        <OAuthButtons google={oauthProviders.google} discord={oauthProviders.discord} />
      </div>
    </>
  );
}
