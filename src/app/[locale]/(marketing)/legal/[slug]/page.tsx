import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { LEGAL_SLUGS, getLegalDocument, legalReviewed, type LegalSlug } from "@/content/legal";
import { getCompanyDetails } from "@/lib/company";

function isLegalSlug(value: string): value is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(value);
}

export function generateStaticParams() {
  return LEGAL_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/legal/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLegalSlug(slug)) return {};
  const doc = getLegalDocument(locale, slug);
  return {
    title: doc.title,
    description: doc.intro,
    alternates: { canonical: `/${locale}/legal/${slug}` },
  };
}

export default async function LegalPage({ params }: PageProps<"/[locale]/legal/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  if (!isLegalSlug(slug)) notFound();

  const [doc, t, format] = await Promise.all([
    getLegalDocument(locale, slug),
    getTranslations("legal"),
    getFormatter(),
  ]);
  const company = getCompanyDetails();

  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
      <h1 className="text-3xl font-bold sm:text-4xl">{doc.title}</h1>
      <p className="mt-3 text-muted-foreground">{doc.intro}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("updated", { date: format.dateTime(new Date(doc.updated), { dateStyle: "long" }) })}
      </p>

      {/* Two things a visitor is entitled to know, and that we must not hide. */}
      {legalReviewed() ? null : <Notice title={t("draftTitle")} body={t("draftBody")} />}
      {company ? null : <Notice title={t("noCompanyTitle")} body={t("noCompanyBody")} />}

      <div className="mt-10 space-y-10">
        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-xl font-semibold">{section.heading}</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            {section.bullets ? (
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-8 flex gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 opacity-90">{body}</p>
      </div>
    </div>
  );
}
