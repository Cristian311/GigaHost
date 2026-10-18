/**
 * Legal pages live here rather than in `src/messages/*.json` because they are
 * long prose, not interface strings: the messages files carry a key-parity test
 * and are loaded into every request's bundle.
 */
export type LegalSection = {
  heading: string;
  /** Paragraphs. Plain text — no markup is interpreted. */
  body: string[];
  /** Optional bullet list rendered after the paragraphs. */
  bullets?: string[];
};

export type LegalDocument = {
  title: string;
  /** Shown under the title; say what the document is for in one line. */
  intro: string;
  /** ISO date of the last substantive change. */
  updated: string;
  sections: LegalSection[];
};

export type LegalSlug = "terms" | "privacy" | "cookies" | "withdrawal";

export type LegalContent = Record<LegalSlug, LegalDocument>;
