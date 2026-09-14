import { getTranslations } from "next-intl/server";
import { AdminNav } from "@/components/admin/admin-nav";
import { PageHeader } from "@/components/dashboard/page-header";
import { requireAdmin } from "@/server/auth-guard";

export default async function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  await requireAdmin();
  const t = await getTranslations("admin");

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <AdminNav />
      {children}
    </>
  );
}
