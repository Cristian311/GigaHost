import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CONSUMER_LINKS, getCompanyDetails } from "@/lib/company";
import { Logo } from "./logo";

export async function Footer() {
  const t = await getTranslations("footer");
  const nav = await getTranslations("nav");
  const year = new Date().getFullYear();
  const company = getCompanyDetails();

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
      title: t("legal"),
      links: [
        { href: "/legal/terms", label: t("terms") },
        { href: "/legal/privacy", label: t("privacy") },
        { href: "/legal/cookies", label: t("cookies") },
        { href: "/legal/withdrawal", label: t("withdrawal") },
      ],
    },
  ];

  return (
    <footer className="border-t border-white/5 bg-background">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.5fr_repeat(2,1fr)]">
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

      {/* Trader identification and the consumer-protection links, both required
          of a Romanian online shop. Rendered only once the details are
          configured — see src/lib/company.ts. */}
      {company ? (
        <div className="border-t border-white/5">
          <div className="mx-auto max-w-7xl space-y-2 px-4 py-6 text-xs text-muted-foreground sm:px-6">
            <p>
              <span className="text-foreground">{company.legalName}</span>
              {" · "}
              {t("cui")} {company.cui}
              {" · "}
              {t("tradeRegister")} {company.tradeRegister}
              {company.vatNumber ? (
                <>
                  {" · "}
                  {t("vatNumber")} {company.vatNumber}
                </>
              ) : null}
            </p>
            <p>
              {company.address}
              {" · "}
              <a className="hover:text-foreground" href={`mailto:${company.email}`}>
                {company.email}
              </a>
              {company.phone ? (
                <>
                  {" · "}
                  <a className="hover:text-foreground" href={`tel:${company.phone}`}>
                    {company.phone}
                  </a>
                </>
              ) : null}
            </p>
            <p className="flex flex-wrap gap-x-3 gap-y-1">
              <ExternalLink href={CONSUMER_LINKS.anpc}>ANPC</ExternalLink>
              <ExternalLink href={CONSUMER_LINKS.anpcSal}>{t("anpcSal")}</ExternalLink>
              <ExternalLink href={CONSUMER_LINKS.odr}>{t("odr")}</ExternalLink>
            </p>
          </div>
        </div>
      ) : null}

      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {year} {company?.legalName ?? "GigaHost"}. {t("rights")}
          </p>
        </div>
      </div>
    </footer>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="underline underline-offset-2 transition-colors hover:text-foreground"
    >
      {children}
    </a>
  );
}
