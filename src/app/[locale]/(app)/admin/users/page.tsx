import { setRequestLocale } from "next-intl/server";
import { UsersTable } from "@/components/admin/users-table";
import { requireAdmin } from "@/server/auth-guard";
import { listUsers } from "@/server/services/admin-service";

export default async function AdminUsersPage({ params }: PageProps<"/[locale]/admin/users">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const admin = await requireAdmin();
  const users = await listUsers();
  return <UsersTable users={users} currentUserId={admin.id} />;
}
