"use client";

import { CreditCard, Server, Settings, ShieldCheck, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean };

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const items: Item[] = [
    { href: "/dashboard", label: t("servers"), icon: Server, exact: false },
    { href: "/dashboard/billing", label: t("billing"), icon: CreditCard },
    { href: "/account", label: t("account"), icon: Settings },
  ];
  if (isAdmin) items.push({ href: "/admin", label: t("admin"), icon: ShieldCheck });

  const isActive = (item: Item) => {
    if (item.href === "/dashboard") {
      return pathname === "/dashboard" || pathname.startsWith("/dashboard/servers");
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {items.map((item) => {
        const active = isActive(item);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
