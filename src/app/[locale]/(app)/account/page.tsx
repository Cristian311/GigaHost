import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { PasswordForm, ProfileForm } from "@/components/account/account-forms";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/server/auth-guard";
import { getUserById } from "@/server/services/user-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("title") };
}

export default async function AccountPage({ params }: PageProps<"/[locale]/account">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireUser();
  const [t, format, user] = await Promise.all([
    getTranslations("account"),
    getFormatter(),
    getUserById(session.id),
  ]);
  if (!user) notFound();

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/5 bg-card p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("profile")}</h2>
            <Badge variant="outline">{user.role}</Badge>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            {t("email")}: <span className="text-foreground">{user.email}</span>
            <br />
            {t("memberSince", { date: format.dateTime(user.createdAt, { dateStyle: "medium" }) })}
          </p>
          <ProfileForm name={user.name ?? ""} locale={user.locale} />
        </section>

        <section className="rounded-2xl border border-white/5 bg-card p-6">
          <h2 className="mb-5 text-lg font-semibold">{t("security")}</h2>
          {user.passwordHash ? (
            <PasswordForm />
          ) : (
            <p className="text-sm text-muted-foreground">{t("noPassword")}</p>
          )}
        </section>
      </div>
    </>
  );
}
