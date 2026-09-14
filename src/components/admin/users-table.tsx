"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import { setUserRoleAction } from "@/server/actions/admin";

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string;
  role: "USER" | "ADMIN";
  createdAt: Date;
  _count: { servers: number; orders: number };
};

export function UsersTable({ users, currentUserId }: { users: AdminUserRow[]; currentUserId: string }) {
  const t = useTranslations("admin.users");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle(user: AdminUserRow) {
    startTransition(async () => {
      const result = await setUserRoleAction({
        userId: user.id,
        role: user.role === "ADMIN" ? "USER" : "ADMIN",
      });
      if (!result.ok) {
        toast.error(result.error === "cannot_demote_self" ? t("cannotDemoteSelf") : result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/5 bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("email")}</TableHead>
            <TableHead>{t("role")}</TableHead>
            <TableHead>{t("servers")}</TableHead>
            <TableHead>{t("orders")}</TableHead>
            <TableHead>{t("joined")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.name ?? "—"}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Badge variant={user.role === "ADMIN" ? "default" : "outline"}>{user.role}</Badge>
              </TableCell>
              <TableCell>{user._count.servers}</TableCell>
              <TableCell>{user._count.orders}</TableCell>
              <TableCell>{format.dateTime(user.createdAt, { dateStyle: "medium" })}</TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || user.id === currentUserId}
                  onClick={() => toggle(user)}
                >
                  {user.role === "ADMIN" ? t("makeUser") : t("makeAdmin")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
