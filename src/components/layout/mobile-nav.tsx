"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Link } from "@/i18n/navigation";

export type NavLink = { href: string; label: string };

export function MobileNav({
  links,
  isAuthenticated,
}: {
  links: NavLink[];
  isAuthenticated: boolean;
}) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="md:hidden" aria-label={t("openMenu")} />
        }
      >
        <Menu />
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetHeader>
          <SheetTitle>GigaHost</SheetTitle>
        </SheetHeader>
        <nav className="mt-4 flex flex-col gap-1 px-4">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-base font-medium hover:bg-muted"
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-4 flex flex-col gap-2">
            {isAuthenticated ? (
              <Button render={<Link href="/dashboard" onClick={() => setOpen(false)} />}>
                {t("dashboard")}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  render={<Link href="/login" onClick={() => setOpen(false)} />}
                >
                  {t("login")}
                </Button>
                <Button render={<Link href="/register" onClick={() => setOpen(false)} />}>
                  {t("register")}
                </Button>
              </>
            )}
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
