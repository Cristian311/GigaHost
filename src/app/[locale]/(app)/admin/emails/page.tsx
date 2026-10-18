import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmailsTable } from "@/components/admin/emails-table";
import { listEmails } from "@/server/mail/mailer";
import { requireAdmin } from "@/server/auth-guard";

export default async function AdminEmailsPage({ params }: PageProps<"/[locale]/admin/emails">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const [t, emails] = await Promise.all([getTranslations("admin.emails"), listEmails(100)]);

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        {process.env.SMTP_URL ? t("hintSmtp") : t("hintOutbox")}
      </p>
      <EmailsTable
        emails={emails.map((email) => ({
          id: email.id,
          to: email.to,
          subject: email.subject,
          template: email.template,
          status: email.status,
          error: email.error,
          html: email.html,
          text: email.text,
          createdAt: email.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
