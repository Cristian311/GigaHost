import { CheckCircle2, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { AppError } from "@/server/errors";
import { verifyEmail } from "@/server/services/account-security-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.verify");
  return { title: t("title") };
}

export default async function VerifyEmailPage({
  params,
  searchParams,
}: PageProps<"/[locale]/verify-email">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const t = await getTranslations("auth.verify");

  const token = typeof query.token === "string" ? query.token : "";
  let verified = false;
  if (token) {
    try {
      await verifyEmail(token);
      verified = true;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    }
  }

  return (
    <div className="text-center">
      {verified ? (
        <CheckCircle2 className="mx-auto size-12 text-success" />
      ) : (
        <XCircle className="mx-auto size-12 text-destructive" />
      )}
      <h1 className="mt-4 text-2xl font-bold">{verified ? t("okTitle") : t("failedTitle")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {verified ? t("okBody") : t("failedBody")}
      </p>
      <Button className="mt-6" render={<Link href="/dashboard" />}>
        {t("continue")}
      </Button>
    </div>
  );
}
