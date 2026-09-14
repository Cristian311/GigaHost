"use client";

import { CreditCard, LayoutDashboard, LogOut, Settings, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import { logoutAction } from "@/server/actions/auth";

type Props = {
  user: { name?: string | null; email?: string | null; image?: string | null; role: string };
};

export function UserMenu({ user }: Props) {
  const t = useTranslations("nav");
  const initials = (user.name ?? user.email ?? "?")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="gap-2 pl-1.5" />}>
        <Avatar className="size-6">
          {user.image ? <AvatarImage src={user.image} alt="" /> : null}
          <AvatarFallback className="bg-primary/20 text-[10px] text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-32 truncate sm:inline">{user.name ?? user.email}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/dashboard" />}>
            <LayoutDashboard /> {t("dashboard")}
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/dashboard/billing" />}>
            <CreditCard /> {t("billing")}
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/account" />}>
            <Settings /> {t("account")}
          </DropdownMenuItem>
          {user.role === "ADMIN" ? (
            <DropdownMenuItem render={<Link href="/admin" />}>
              <ShieldCheck /> {t("admin")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => logoutAction()}>
          <LogOut /> {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
