import { legalEn } from "./en";
import { legalRo } from "./ro";
import type { LegalContent, LegalDocument, LegalSlug } from "./types";

export type { LegalDocument, LegalSection, LegalSlug } from "./types";

export const LEGAL_SLUGS = ["terms", "privacy", "cookies", "withdrawal"] as const;

const BY_LOCALE: Record<string, LegalContent> = { en: legalEn, ro: legalRo };

export function getLegalDocument(locale: string, slug: LegalSlug): LegalDocument {
  return (BY_LOCALE[locale] ?? legalEn)[slug];
}

/**
 * Whether the documents have been through a lawyer.
 *
 * They were drafted from what the code does, which makes them accurate but not
 * authoritative: a policy can describe the system perfectly and still get the
 * law wrong. Until this is set, every legal page carries a notice saying so —
 * shipping unreviewed terms quietly is the failure worth preventing.
 */
export function legalReviewed(): boolean {
  return (process.env.LEGAL_REVIEWED ?? "").toLowerCase() === "true";
}
