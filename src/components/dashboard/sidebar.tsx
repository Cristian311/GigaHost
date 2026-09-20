"use client";

import {
  CreditCard,
  LifeBuoy,
  MessagesSquare,
  Server,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useStaffPresence } from "@/components/support/use-staff-presence";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean; presence?: boolean };

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const staffOnline = useStaffPresence();

  const items: Item[] = [
    { href: "/dashboard", label: t("servers"), icon: Server, exact: false },
    { href: "/dashboard/billing", label: t("billing"), icon: CreditCard },
    { href: "/dashboard/support", label: t("support"), icon: LifeBuoy },
    { href: "/dashboard/support/chat", label: t("chat"), icon: MessagesSquare, presence: true },
    { href: "/account", label: t("account"), icon: Settings },
  ];
  if (isAdmin) items.push({ href: "/admin", label: t("admin"), icon: ShieldCheck });

  const isActive = (item: Item) => {
    if (item.href === "/dashboard") {
      return pathname === "/dashboard" || pathname.startsWith("/dashboard/servers");
    }
    if (item.href === "/dashboard/support") {
      return (
        pathname.startsWith("/dashboard/support") && !pathname.startsWith("/dashboard/support/chat")
      );
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
            {item.presence ? (
              // Green while an admin is on the support pages.
              <span
                aria-hidden
                className={cn(
                  "ml-auto size-2 rounded-full",
                  staffOnline ? "bg-success" : "bg-muted-foreground/40",
                )}
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
