/** `Game.unavailableReason` value rendered as the localized "Coming soon". */
export const COMING_SOON = "coming_soon";

/** Parses the JSON-encoded `Game.versions` column safely. */
export function parseVersions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function serializeVersions(list: string[]): string {
  return JSON.stringify(list.map((v) => v.trim()).filter(Boolean));
}
