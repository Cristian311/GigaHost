"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function AdminNav() {
  const t = useTranslations("admin.nav");
  const pathname = usePathname();
  const items = [
    { href: "/admin", label: t("overview") },
    { href: "/admin/servers", label: t("servers") },
    { href: "/admin/games", label: t("games") },
    { href: "/admin/regions", label: t("regions") },
    { href: "/admin/pricing", label: t("pricing") },
    { href: "/admin/coupons", label: t("coupons") },
    { href: "/admin/billing", label: t("billing") },
    { href: "/admin/users", label: t("users") },
    { href: "/admin/emails", label: t("emails") },
    { href: "/admin/audit", label: t("audit") },
  ];

  return (
    <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-white/5 bg-card/60 p-1">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
