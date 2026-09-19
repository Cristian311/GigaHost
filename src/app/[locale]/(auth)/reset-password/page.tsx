import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { isResetTokenValid } from "@/server/services/account-security-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.reset");
  return { title: t("title") };
}

export default async function ResetPasswordPage({
  params,
  searchParams,
}: PageProps<"/[locale]/reset-password">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const t = await getTranslations("auth.reset");

  const token = typeof query.token === "string" ? query.token : "";
  // Checked up front so nobody types a new password into a dead link.
  const valid = token.length > 0 && (await isResetTokenValid(token));

  return (
    <>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {valid ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
          <div className="mt-6">
            <ResetPasswordForm token={token} />
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm">
          <p className="font-medium text-destructive">{t("invalidTitle")}</p>
          <p className="mt-2 text-muted-foreground">{t("invalidBody")}</p>
          <Button className="mt-4" variant="outline" render={<Link href="/forgot-password" />}>
            {t("requestNew")}
          </Button>
        </div>
      )}
    </>
  );
}
