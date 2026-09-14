import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./logo";
import { MobileNav, type NavLink } from "./mobile-nav";
import { UserMenu } from "./user-menu";

export async function Navbar() {
  const [t, session] = await Promise.all([getTranslations("nav"), auth()]);
  const user = session?.user;

  const links: NavLink[] = [
    { href: "/games", label: t("games") },
    { href: "/configure", label: t("pricing") },
    { href: "/#features", label: t("features") },
    { href: "/#faq", label: t("faq") },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <LanguageSwitcher />
          {user ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="hidden md:inline-flex"
                render={<Link href="/dashboard" />}
              >
                {t("dashboard")}
              </Button>
              <UserMenu user={{ ...user, role: user.role }} />
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="hidden md:inline-flex"
                render={<Link href="/login" />}
              >
                {t("login")}
              </Button>
              <Button size="sm" className="hidden md:inline-flex" render={<Link href="/register" />}>
                {t("register")}
              </Button>
            </>
          )}
          <MobileNav links={links} isAuthenticated={Boolean(user)} />
        </div>
      </div>
    </header>
  );
}
