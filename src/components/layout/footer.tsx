import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "./logo";

export async function Footer() {
  const t = await getTranslations("footer");
  const nav = await getTranslations("nav");
  const year = new Date().getFullYear();

  const columns = [
    {
      title: t("product"),
      links: [
        { href: "/games", label: nav("games") },
        { href: "/configure", label: nav("pricing") },
        { href: "/#features", label: nav("features") },
        { href: "/#faq", label: nav("faq") },
      ],
    },
    {
      title: t("company"),
      links: [
        { href: "/#", label: t("about") },
        { href: "/#", label: t("status") },
        { href: "/#", label: t("contact") },
      ],
    },
    {
      title: t("legal"),
      links: [
        { href: "/#", label: t("terms") },
        { href: "/#", label: t("privacy") },
      ],
    },
  ];

  return (
    <footer className="border-t border-white/5 bg-background">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">{t("tagline")}</p>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <h3 className="mb-3 text-sm font-semibold">{column.title}</h3>
            <ul className="space-y-2">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {year} GigaHost. {t("rights")}
          </p>
          <p className="font-mono">v0.1 · preview</p>
        </div>
      </div>
    </footer>
  );
}
